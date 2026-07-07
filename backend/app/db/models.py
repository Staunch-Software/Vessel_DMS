"""SQLAlchemy models.

- Vessel:    one row per ship (name + IMO).
- Folder:    cache of logical-path -> SharePoint driveItem id, so we don't have
             to re-walk the Graph tree on every request. Also stores the semantic
             flags (kind / month_driven) derived from the folder template.
- UploadJob: tracks an upload's OCR + filing lifecycle for the polling UI.
"""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Vessel(Base):
    __tablename__ = "vessels"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    imo: Mapped[str | None] = mapped_column(String(7), unique=True, nullable=True)
    shipyard: Mapped[str | None] = mapped_column(String(200), nullable=True)
    hull_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    vessel_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    folders: Mapped[list["Folder"]] = relationship(
        back_populates="vessel", cascade="all, delete-orphan"
    )


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Logical path within the container, e.g.
    # "Technical & Crewing/MV Horizon/Month End Reports".
    path: Mapped[str] = mapped_column(String(1024), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(400))
    kind: Mapped[str] = mapped_column(String(40))  # main/ship/folder/leaf/month_driven/month
    drive_item_id: Mapped[str] = mapped_column(String(256), index=True)
    month_driven: Mapped[bool] = mapped_column(Boolean, default=False)

    vessel_id: Mapped[int | None] = mapped_column(
        ForeignKey("vessels.id", ondelete="CASCADE"), nullable=True
    )
    vessel: Mapped["Vessel | None"] = relationship(back_populates="folders")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class UploadJob(Base):
    __tablename__ = "upload_jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(400))
    status: Mapped[str] = mapped_column(String(20), default="processing")
    destination: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    detected_month: Mapped[str | None] = mapped_column(String(40), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
