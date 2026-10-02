from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased

from app.database import Base, engine, get_db
from app.models import Challenge, ChallengeStatus, User, UserStatus


@asynccontextmanager
async def lifespan(_: FastAPI):
	Base.metadata.create_all(bind=engine)
	yield


app = FastAPI(title="ChessHub API", lifespan=lifespan)
app.add_middleware(
	CORSMiddleware,
	allow_origins=["*"],
	allow_credentials=False,
	allow_methods=["*"],
	allow_headers=["*"],
)


class UserCreate(BaseModel):
	username: str = Field(min_length=1, max_length=50)
	avatar_url: str | None = Field(default=None, max_length=500)


class UserResponse(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	username: str
	avatar_url: str | None
	status: UserStatus


class PlayerResponse(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	username: str
	status: UserStatus


class ChallengeCreate(BaseModel):
	sender_id: int = Field(gt=0)
	receiver_id: int = Field(gt=0)


class ChallengeResponse(BaseModel):
	model_config = ConfigDict(from_attributes=True)

	id: int
	sender_id: int
	receiver_id: int
	status: ChallengeStatus


class MatchResponse(BaseModel):
	challenge_id: int
	status: ChallengeStatus
	player_ids: list[int]


class IncomingChallengeResponse(BaseModel):
	id: int
	sender_id: int
	sender_username: str
	status: ChallengeStatus


class ActiveMatchResponse(BaseModel):
	challenge_id: int
	opponent_id: int
	opponent_username: str
	status: ChallengeStatus


@app.get("/health")
def health_check() -> dict[str, str]:
	return {"status": "ok"}


@app.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, database: Session = Depends(get_db)) -> User:
	user = User(username=payload.username, avatar_url=payload.avatar_url)
	database.add(user)
	try:
		database.commit()
	except IntegrityError as error:
		database.rollback()
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Username is already registered",
		) from error
	database.refresh(user)
	return user


@app.get("/players/active", response_model=list[PlayerResponse])
def list_active_players(database: Session = Depends(get_db)) -> list[User]:
	statement = (
		select(User)
		.where(User.status == UserStatus.AVAILABLE)
		.order_by(User.id)
	)
	return list(database.scalars(statement).all())


@app.post(
	"/challenges",
	response_model=ChallengeResponse,
	status_code=status.HTTP_201_CREATED,
)
def create_challenge(
	payload: ChallengeCreate, database: Session = Depends(get_db)
) -> Challenge:
	if payload.sender_id == payload.receiver_id:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="A player cannot challenge themselves",
		)

	players = database.scalars(
		select(User).where(User.id.in_([payload.sender_id, payload.receiver_id]))
	).all()
	players_by_id = {player.id: player for player in players}
	if len(players_by_id) != 2:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Both players must exist",
		)

	if any(player.status != UserStatus.AVAILABLE for player in players):
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Both players must be available",
		)

	challenge = Challenge(
		sender_id=payload.sender_id,
		receiver_id=payload.receiver_id,
	)
	database.add(challenge)
	database.commit()
	database.refresh(challenge)
	return challenge


@app.get(
	"/challenges/incoming/{receiver_id}",
	response_model=list[IncomingChallengeResponse],
)
def list_incoming_challenges(
	receiver_id: int, database: Session = Depends(get_db)
) -> list[IncomingChallengeResponse]:
	statement = (
		select(
			Challenge.id,
			Challenge.sender_id,
			User.username,
			Challenge.status,
		)
		.join(User, User.id == Challenge.sender_id)
		.where(
			Challenge.receiver_id == receiver_id,
			Challenge.status == ChallengeStatus.PENDING,
		)
		.order_by(Challenge.id)
	)
	return [
		IncomingChallengeResponse(
			id=challenge_id,
			sender_id=sender_id,
			sender_username=sender_username,
			status=challenge_status,
		)
		for challenge_id, sender_id, sender_username, challenge_status in database.execute(
			statement
		).all()
	]


@app.get(
	"/challenges/active/{user_id}",
	response_model=ActiveMatchResponse | None,
)
def get_active_match(
	user_id: int, database: Session = Depends(get_db)
) -> ActiveMatchResponse | None:
	sender = aliased(User, name="sender")
	receiver = aliased(User, name="receiver")
	statement = (
		select(Challenge, sender, receiver)
		.join(sender, sender.id == Challenge.sender_id)
		.join(receiver, receiver.id == Challenge.receiver_id)
		.where(
			Challenge.status == ChallengeStatus.ACCEPTED,
			(Challenge.sender_id == user_id) | (Challenge.receiver_id == user_id),
		)
		.order_by(Challenge.id.desc())
		.limit(1)
	)
	result = database.execute(statement).first()
	if result is None:
		return None

	challenge, sender_user, receiver_user = result
	opponent = receiver_user if challenge.sender_id == user_id else sender_user
	return ActiveMatchResponse(
		challenge_id=challenge.id,
		opponent_id=opponent.id,
		opponent_username=opponent.username,
		status=challenge.status,
	)


@app.patch(
	"/challenges/{challenge_id}/accept",
	response_model=MatchResponse,
)
def accept_challenge(
	challenge_id: int, database: Session = Depends(get_db)
) -> MatchResponse:
	challenge = database.scalar(
		select(Challenge)
		.where(Challenge.id == challenge_id)
		.with_for_update()
	)
	if challenge is None:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Challenge not found",
		)
	if challenge.status != ChallengeStatus.PENDING:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Challenge has already been accepted",
		)

	player_ids = sorted([challenge.sender_id, challenge.receiver_id])
	locked_players = database.scalars(
		select(User).where(User.id.in_(player_ids)).order_by(User.id).with_for_update()
	).all()
	if len(locked_players) != 2:
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Challenge players are no longer available",
		)
	if any(player.status != UserStatus.AVAILABLE for player in locked_players):
		raise HTTPException(
			status_code=status.HTTP_409_CONFLICT,
			detail="Both players must still be available",
		)

	for player in locked_players:
		player.status = UserStatus.IN_GAME
	challenge.status = ChallengeStatus.ACCEPTED
	database.commit()

	return MatchResponse(
		challenge_id=challenge.id,
		status=challenge.status,
		player_ids=player_ids,
	)
