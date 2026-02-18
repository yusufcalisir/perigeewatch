"""
ML Anomaly Detection Service (LSTM Autoencoder)

Detects anomalous orbital behavior using a deep learning approach.
Implements an LSTM Autoencoder to learn the "normal" temporal patterns
of a satellite's orbital elements (Mean Motion, Eccentricity, BSTAR)
and flags deviations based on reconstruction error.

Features:
- PyTorch-based LSTM Autoencoder
- Online learning (trains on recent history per request/cache)
- Multivariate time-series analysis
"""

import math
import numpy as np
import torch
import torch.nn as nn
from typing import List, Dict, Any
from sgp4.api import Satrec, WGS72
import logging

logger = logging.getLogger(__name__)

# Device configuration (CPU is sufficient for small inference)
device = torch.device('cpu')


class LSTMAutoencoder(nn.Module):
    def __init__(self, input_dim=3, hidden_dim=16, num_layers=1):
        super(LSTMAutoencoder, self).__init__()
        self.input_dim = input_dim
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers

        # Encoder
        self.encoder = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True
        )

        # Decoder
        self.decoder = nn.LSTM(
            input_size=hidden_dim,  # Accepts context vector
            hidden_size=input_dim,  # Outputs reconstructed features
            num_layers=num_layers,
            batch_first=True
        )
        
        # Output mapping (optional, or let decoder LSTM project directly if hidden_size=input_dim)
        # But usually Decoder Hidden -> Linear -> Output.
        # Here we simplify: Decoder takes hidden state, outputs hidden state sequence -> Linear -> Reconstruction
        self.decoder_lstm = nn.LSTM(
            input_size=hidden_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True
        )
        self.output_layer = nn.Linear(hidden_dim, input_dim)

    def forward(self, x):
        # x shape: (batch_size, seq_len, input_dim)
        
        # Encoder
        _, (hidden, cell) = self.encoder(x)
        
        # Latent representation (last hidden state)
        # hidden shape: (num_layers, batch, hidden_dim)
        # We repeat the latent vector to form the input sequence for the decoder
        seq_len = x.shape[1]
        latent = hidden[-1].unsqueeze(1).repeat(1, seq_len, 1) # (batch, seq_len, hidden_dim)
        
        # Decoder
        decoded_out, _ = self.decoder_lstm(latent)
        
        # Map to output dimension
        reconstructed = self.output_layer(decoded_out)
        
        return reconstructed


def extract_features(tle_history: List[Dict[str, Any]]) -> np.ndarray:
    """
    Extracts numerical features from TLE history for ML model.
    Features: [Mean Motion, Eccentricity, BSTAR]
    """
    features = []
    for tle in tle_history:
        try:
            sat = Satrec.twoline2rv(tle['line1'], tle['line2'], WGS72)
            # Normalize/Scale features (StandardScaler logic manual or simplified)
            # We'll return raw for now and normalize in the training loop
            features.append([
                sat.no_kozai * 60.0 / (2 * math.pi), # Mean Motion (rev/day)
                sat.ecco,                            # Eccentricity
                sat.bstar                            # BSTAR (drag)
            ])
        except Exception:
            continue
    return np.array(features, dtype=np.float32)


def train_and_detect(
    tle_history: List[Dict[str, Any]],
    seq_len: int = 10,
    epochs: int = 50,
    threshold_percentile: float = 95.0
) -> Dict[str, Any]:
    """
    Trains a lightweight LSTM AE on the provided history and detects anomalies.
    
    Strategy:
    1. Preprocess data (Normalize).
    2. Create sliding window sequences.
    3. Train potential "normal" patterns (Autoencoder).
    4. Compute reconstruction error for each sequence.
    5. If Error > Threshold (statistical limit of errors), flag as anomaly.
    """
    if len(tle_history) < seq_len * 2:
        return {"status": "insufficient_data", "required": seq_len * 2, "found": len(tle_history)}

    # 1. Feature Extraction
    raw_data = extract_features(tle_history) # (N, 3)
    if len(raw_data) == 0:
        return {"error": "Feature extraction failed"}

    # 2. Normalization (Min-Max or Standard)
    # Using simple Standard Scaling
    mean = np.mean(raw_data, axis=0)
    std = np.std(raw_data, axis=0)
    std[std == 0] = 1.0 # Prevent division by zero
    data_norm = (raw_data - mean) / std
    
    # 3. Create Sequences
    sequences = []
    for i in range(len(data_norm) - seq_len + 1):
        sequences.append(data_norm[i : i + seq_len])
    
    if not sequences:
        return {"status": "insufficient_data"}
        
    X = torch.FloatTensor(np.array(sequences)).to(device) # (Batch, Seq_Len, Features)
    
    # 4. Initialize Model
    model = LSTMAutoencoder(input_dim=3, hidden_dim=8).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    criterion = nn.MSELoss()
    
    # 5. Online Training
    model.train()
    for episode in range(epochs):
        optimizer.zero_grad()
        output = model(X)
        loss = criterion(output, X)
        loss.backward()
        optimizer.step()
        
    # 6. Inference / Anomaly Detection
    model.eval()
    with torch.no_grad():
        reconstructed = model(X)
        # Compute error per sequence (MSE across features and time steps)
        # Shape: (Batch, Seq_Len, Features)
        error_tensor = torch.mean((X - reconstructed) ** 2, dim=[1, 2])
        errors = error_tensor.cpu().numpy()
        
    # 7. Thresholding
    # We define anomalies as errors exceeding the user-specified percentile
    # or a hard statistical limit (Mean + 3*Std) if the distribution is Gaussian-ish.
    threshold = np.percentile(errors, threshold_percentile)
    # Also enforce a minimum noise floor to avoid overfitting on perfect data
    threshold = max(threshold, 0.05) 
    
    anomalies = []
    
    # Map back to original TLEs (sequence end timestamp)
    # Sequence i corresponds to TLE index i + seq_len - 1
    for i, error in enumerate(errors):
        if error > threshold:
            idx = i + seq_len - 1
            tle_idx = idx
            if tle_idx < len(tle_history):
                tle_entry = tle_history[tle_idx]
                anomalies.append({
                    "epoch": tle_entry.get("epoch"),
                    "reconstruction_error": float(error),
                    "threshold": float(threshold),
                    "score": round(float(error / threshold), 2), # Severity score
                    "type": "ml_anomaly",
                    "description": f"Abnormal orbital pattern detected (Score: {float(error/threshold):.1f}x)"
                })
    
    # Sort anomalies by epoch (newest first)
    anomalies.sort(key=lambda x: x['epoch'] if isinstance(x['epoch'], str) else x['epoch'].isoformat(), reverse=True)
    
    return {
        "status": "success",
        "model_type": "LSTM_Autoencoder",
        "training_epochs": epochs,
        "sequence_length": seq_len,
        "total_analyzed": len(sequences),
        "anomaly_count": len(anomalies),
        "threshold_error": float(threshold),
        "anomalies": anomalies
    }
