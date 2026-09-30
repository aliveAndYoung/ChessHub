from enum import Enum

from sqlalchemy import Enum as SqlEnum
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    IN_GAME = "IN_GAME"


class ChallengeStatus(str, Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"


class User(Base):
    __tablename__ = "users"
    

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    _default_avatar = "https://upload.wikimedia.org/wikipedia/commons/c/c1/Avatar_chess.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original"
    avatar_url: Mapped[str | None] = mapped_column(String(500) , default=_default_avatar , nullable=True)
    status: Mapped[UserStatus] = mapped_column(
        SqlEnum(UserStatus), default=UserStatus.AVAILABLE, nullable=False
    )

    sent_challenges: Mapped[list["Challenge"]] = relationship(
        back_populates="sender", foreign_keys="Challenge.sender_id"
    )
    received_challenges: Mapped[list["Challenge"]] = relationship(
        back_populates="receiver", foreign_keys="Challenge.receiver_id"
    )


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(primary_key=True)
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    receiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    status: Mapped[ChallengeStatus] = mapped_column(
        SqlEnum(ChallengeStatus), default=ChallengeStatus.PENDING, nullable=False
    )

    sender: Mapped[User] = relationship(
        back_populates="sent_challenges", foreign_keys=[sender_id]
    )
    receiver: Mapped[User] = relationship(
        back_populates="received_challenges", foreign_keys=[receiver_id]
    )