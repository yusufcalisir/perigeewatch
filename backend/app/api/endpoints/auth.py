"""
JWT Authentication System

Provides:
- User registration (email + password)
- Login (returns JWT access token)
- Token refresh
- API key generation for external consumers
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.user import User
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr
import hashlib
import hmac
import json
import base64
import secrets
import os

router = APIRouter()
security = HTTPBearer(auto_error=False)

# JWT Secret — use env var in production
JWT_SECRET = os.getenv("JWT_SECRET", "perigee-watch-jwt-secret-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours


# ── Pydantic Models ──

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str = ""

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: int
    email: str

class APIKeyResponse(BaseModel):
    api_key: str
    created_at: str


# ── Password Hashing ──

def hash_password(password: str) -> str:
    """SHA-256 based password hashing with salt."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{key.hex()}"

def verify_password(stored: str, provided: str) -> bool:
    """Verify a password against its hash."""
    try:
        salt, key_hex = stored.split(":")
        key = hashlib.pbkdf2_hmac('sha256', provided.encode(), salt.encode(), 100000)
        return hmac.compare_digest(key.hex(), key_hex)
    except Exception:
        return False


# ── JWT Token ──

def create_jwt(payload: dict) -> str:
    """Create a simple JWT token."""
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload, default=str).encode()).rstrip(b"=").decode()
    signature = hmac.new(JWT_SECRET.encode(), f"{header}.{payload_b64}".encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).rstrip(b"=").decode()
    return f"{header}.{payload_b64}.{sig_b64}"

def decode_jwt(token: str) -> dict:
    """Decode and verify a JWT token."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Invalid token format")
        
        header, payload_b64, signature = parts
        
        # Verify signature
        expected_sig = hmac.new(JWT_SECRET.encode(), f"{header}.{payload_b64}".encode(), hashlib.sha256).digest()
        expected_b64 = base64.urlsafe_b64encode(expected_sig).rstrip(b"=").decode()
        
        if not hmac.compare_digest(signature, expected_b64):
            raise ValueError("Invalid signature")
        
        # Decode payload
        padding = 4 - len(payload_b64) % 4
        payload_b64 += "=" * padding
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        
        # Check expiration
        if "exp" in payload:
            exp = datetime.fromisoformat(payload["exp"])
            if datetime.utcnow() > exp:
                raise ValueError("Token expired")
        
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")


# ── Dependency ──

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """Extract and verify current user from JWT token or API key."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    token = credentials.credentials
    
    # Check if it's an API key
    if token.startswith("pw_"):
        user = db.query(User).filter(User.api_key == token).first()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid API key")
        return user
    
    # Otherwise treat as JWT
    payload = decode_jwt(token)
    user = db.query(User).filter(User.id == payload.get("user_id")).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ── Endpoints ──

@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    """Register a new user."""
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    
    user = User(
        email=req.email,
        password_hash=hash_password(req.password),
        name=req.name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    expires = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_jwt({
        "user_id": user.id,
        "email": user.email,
        "exp": expires.isoformat(),
    })
    
    return TokenResponse(
        access_token=token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        email=user.email,
    )


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    """Login with email and password."""
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(user.password_hash, req.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    expires = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    token = create_jwt({
        "user_id": user.id,
        "email": user.email,
        "exp": expires.isoformat(),
    })
    
    return TokenResponse(
        access_token=token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        email=user.email,
    )


@router.post("/api-key", response_model=APIKeyResponse)
def generate_api_key(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a new API key for the authenticated user."""
    api_key = f"pw_{secrets.token_hex(24)}"
    user.api_key = api_key
    db.commit()
    
    return APIKeyResponse(
        api_key=api_key,
        created_at=datetime.utcnow().isoformat() + "Z",
    )


@router.get("/me")
def get_profile(user: User = Depends(get_current_user)):
    """Get current user profile."""
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "created_at": str(user.created_at),
        "has_api_key": bool(user.api_key),
    }
