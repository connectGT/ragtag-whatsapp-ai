"""
database.py - Relational Database Layer for RAGTAG
SQLite Schema definition using SQLAlchemy ORM.
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import create_engine, String, Text, DateTime, Integer, ForeignKey
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

DATABASE_URL = "sqlite:///msgstore_ragtag.db"

# Database Engine & Session Setup
engine = create_engine(DATABASE_URL, echo=False, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy declarative models."""
    pass


class Contact(Base):
    """
    Contact Model
    Represents users/senders in WhatsApp chats.
    """
    __tablename__ = "contacts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)

    # Relationships
    messages: Mapped[list["Message"]] = relationship(
        "Message", back_populates="sender", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Contact(id='{self.id}', name='{self.name}')>"


class Message(Base):
    """
    Message Model
    Represents raw WhatsApp chat messages (Analytical Ground Truth).
    """
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    sender_id: Mapped[str] = mapped_column(String, ForeignKey("contacts.id"), nullable=False)
    chat_name: Mapped[str] = mapped_column(String, index=True, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    sender: Mapped["Contact"] = relationship("Contact", back_populates="messages")
    tasks: Mapped[list["Task"]] = relationship(
        "Task", back_populates="context_message", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Message(id='{self.id}', chat='{self.chat_name}', sender_id='{self.sender_id}')>"


class Task(Base):
    """
    Task Model (For Dashboard Task View & Context Trace)
    Represents action items extracted from chat messages by local LLM agent.
    """
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_name: Mapped[str] = mapped_column(String, nullable=False)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    priority: Mapped[str] = mapped_column(String, default="Medium", nullable=False)
    status: Mapped[str] = mapped_column(String, default="Pending", nullable=False)
    context_message_id: Mapped[Optional[str]] = mapped_column(
        String, ForeignKey("messages.id"), nullable=True
    )

    # Relationships
    context_message: Mapped[Optional["Message"]] = relationship(
        "Message", back_populates="tasks"
    )

    def __repr__(self) -> str:
        return (
            f"<Task(id={self.id}, name='{self.task_name}', priority='{self.priority}', "
            f"status='{self.status}', context_msg_id='{self.context_message_id}')>"
        )


def init_db():
    """Initializes and creates all tables in msgstore_ragtag.db if they do not exist."""
    Base.metadata.create_all(bind=engine)
    print("Database tables initialized successfully in 'msgstore_ragtag.db'.")


def get_db():
    """Yields a database session instance for operations."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


if __name__ == "__main__":
    init_db()
