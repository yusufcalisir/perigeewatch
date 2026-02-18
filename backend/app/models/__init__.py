# Import all models so SQLAlchemy can resolve relationships
from app.models.satellite import Satellite as Satellite, ObjectType as ObjectType
from app.models.tle import TLE as TLE
from app.models.transponder import Transponder as Transponder
from app.models.conjunction_event import ConjunctionEvent as ConjunctionEvent
from app.models.user import User as User
