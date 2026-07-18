"""SQLAlchemy models.

- Vessel:    one row per ship (name + IMO).
- Folder:    cache of logical-path -> SharePoint driveItem id, so we don't have
             to re-walk the Graph tree on every request. Also stores the semantic
             flags (kind / month_driven) derived from the folder template.
- UploadJob: tracks an upload's OCR + filing lifecycle for the polling UI.
"""
from datetime import date, datetime

# pyrefly: ignore [missing-import]
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, func
# pyrefly: ignore [missing-import]
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


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(200))
    first_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    azure_oid: Mapped[str | None] = mapped_column(String(36), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    department: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    office_location: Mapped[str | None] = mapped_column(String(300), nullable=True)
    office_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    employee_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    manager_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    manager_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    tenant_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    two_factor_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    password_changed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    photo_base64: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_of_joining: Mapped[date | None] = mapped_column(Date, nullable=True)

    folder_permissions: Mapped[list["FolderPermission"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    activity_logs: Mapped[list["ActivityLog"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class FolderPermission(Base):
    __tablename__ = "folder_permissions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_email: Mapped[str] = mapped_column(
        String(320), ForeignKey("user_profiles.email", ondelete="CASCADE"), index=True
    )
    folder_name: Mapped[str] = mapped_column(String(400))
    permission_level: Mapped[str] = mapped_column(String(20))  # edit / view / approve

    user: Mapped["UserProfile"] = relationship(back_populates="folder_permissions")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_email: Mapped[str] = mapped_column(
        String(320), ForeignKey("user_profiles.email", ondelete="CASCADE"), index=True
    )
    action: Mapped[str] = mapped_column(String(100))
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    user: Mapped["UserProfile"] = relationship(back_populates="activity_logs")


class ArchivedItem(Base):
    __tablename__ = "archived_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[str] = mapped_column(String(256), unique=True, index=True)
    item_type: Mapped[str] = mapped_column(String(20))  # "folder" or "file"
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class ApprovalRequest(Base):
    """Pending / decided upload-approval requests.

    When a user uploads a file to a month-driven or approval-gated folder the
    file is placed in a temporary "Pending Approvals" area (SharePoint) and a
    row is inserted here.  An admin then approves or rejects via the
    /approvals/* endpoints; on approval the file is moved to its final
    destination and the row is updated accordingly.
    """

    __tablename__ = "approval_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    filename: Mapped[str] = mapped_column(String(400))
    content_type: Mapped[str] = mapped_column(
        String(200), default="application/octet-stream"
    )
    size: Mapped[int] = mapped_column(default=0)
    uploaded_by_email: Mapped[str] = mapped_column(String(320), index=True)
    uploaded_by_name: Mapped[str] = mapped_column(String(200), default="")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    destination_folder_id: Mapped[str] = mapped_column(String(256))
    destination_path: Mapped[str] = mapped_column(String(1024))
    is_month_upload: Mapped[bool] = mapped_column(Boolean, default=False)
    category: Mapped[str | None] = mapped_column(String(200), nullable=True)
    detected_month: Mapped[str | None] = mapped_column(String(40), nullable=True)
    drive_item_id: Mapped[str] = mapped_column(String(256))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending/approved/rejected
    decided_by_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    final_path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


