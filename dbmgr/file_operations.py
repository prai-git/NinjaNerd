"""
File operations module with atomic operations and integrity checks.

This module provides secure file I/O operations with backup management,
checksum validation, and atomic operations to prevent data corruption.
"""

import os
import json
import shutil
import hashlib
import tempfile
import time
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Optional
from contextlib import contextmanager

from .exceptions import FileIntegrityError, BackupError, LockError


class FileOperations:
    """
    Atomic file operations with integrity protection.
    
    Features:
    - Atomic read/write operations
    - Checksum validation
    - Backup and recovery
    - Lock management
    """
    
    def __init__(self, data_dir: str, backup_dir: str):
        """Initialize file operations manager."""
        self.data_dir = Path(data_dir)
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self._locks = {}
        
    def atomic_read_json(self, file_path: str) -> Dict[str, Any]:
        """
        Atomically read JSON file with integrity validation.
        
        Args:
            file_path: Path to the JSON file
            
        Returns:
            Dict containing the JSON data
            
        Raises:
            FileIntegrityError: If file integrity check fails
            FileNotFoundError: If file doesn't exist
        """
        full_path = self.data_dir / file_path
        
        with self._get_file_lock(full_path, 'read'):
            # Validate file integrity before reading
            if full_path.exists():
                self._validate_file_integrity(full_path)
            
            try:
                with open(full_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    
                # Validate JSON structure
                self._validate_json_structure(data, file_path)
                return data
                
            except json.JSONDecodeError as e:
                raise FileIntegrityError(
                    f"JSON decode error in {file_path}: {str(e)}",
                    file_path=str(full_path)
                )
            except Exception as e:
                raise FileIntegrityError(
                    f"Failed to read file {file_path}: {str(e)}",
                    file_path=str(full_path)
                )
    
    def atomic_write_json(self, file_path: str, data: Dict[str, Any]) -> None:
        """
        Atomically write JSON file with backup creation.
        
        Args:
            file_path: Path to the JSON file
            data: Data to write
            
        Raises:
            BackupError: If backup creation fails
            FileIntegrityError: If write operation fails
        """
        full_path = self.data_dir / file_path
        
        with self._get_file_lock(full_path, 'write'):
            # Create backup before writing
            if full_path.exists():
                self.create_backup(file_path)
            
            # Use temporary file for atomic write
            temp_fd, temp_path = tempfile.mkstemp(
                suffix='.tmp',
                prefix=f'{full_path.name}_',
                dir=full_path.parent
            )
            
            try:
                with os.fdopen(temp_fd, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                    f.flush()
                    os.fsync(f.fileno())
                
                # Validate written file
                with open(temp_path, 'r', encoding='utf-8') as f:
                    json.load(f)  # Validate JSON syntax
                
                # Atomic move
                shutil.move(temp_path, full_path)
                
            except Exception as e:
                # Clean up temporary file
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
                raise FileIntegrityError(
                    f"Failed to write file {file_path}: {str(e)}",
                    file_path=str(full_path)
                )
    
    def create_backup(self, file_path: str) -> str:
        """
        Create timestamped backup of file.
        
        Args:
            file_path: Path to the file to backup
            
        Returns:
            Path to the backup file
            
        Raises:
            BackupError: If backup creation fails
        """
        full_path = self.data_dir / file_path
        
        if not full_path.exists():
            raise BackupError(
                f"Cannot backup non-existent file: {file_path}",
                original_path=str(full_path)
            )
        
        # Create timestamped backup filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        backup_name = f"{full_path.stem}_{timestamp}.backup"
        backup_path = self.backup_dir / backup_name
        
        try:
            shutil.copy2(full_path, backup_path)
            
            # Store metadata
            metadata = {
                "original_path": str(full_path),
                "backup_time": datetime.now().isoformat(),
                "original_checksum": self._calculate_checksum(full_path)
            }
            
            metadata_path = backup_path.with_suffix('.metadata')
            with open(metadata_path, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            return str(backup_path)
            
        except Exception as e:
            raise BackupError(
                f"Failed to create backup for {file_path}: {str(e)}",
                backup_path=str(backup_path),
                original_path=str(full_path)
            )
    
    def restore_backup(self, file_path: str, backup_path: Optional[str] = None) -> None:
        """
        Restore file from backup.
        
        Args:
            file_path: Path to the file to restore
            backup_path: Specific backup to restore from (optional)
            
        Raises:
            BackupError: If restore operation fails
        """
        full_path = self.data_dir / file_path
        
        if backup_path is None:
            # Find most recent backup
            backup_path = self._find_latest_backup(file_path)
        
        if not backup_path or not os.path.exists(backup_path):
            raise BackupError(
                f"No backup found for {file_path}",
                original_path=str(full_path)
            )
        
        try:
            # Validate backup integrity
            metadata_path = Path(backup_path).with_suffix('.metadata')
            if metadata_path.exists():
                with open(metadata_path) as f:
                    metadata = json.load(f)
                
                backup_checksum = self._calculate_checksum(backup_path)
                if backup_checksum != metadata.get('original_checksum'):
                    raise BackupError(
                        f"Backup file is corrupted: {backup_path}",
                        backup_path=backup_path
                    )
            
            # Restore file
            shutil.copy2(backup_path, full_path)
            
        except Exception as e:
            raise BackupError(
                f"Failed to restore backup for {file_path}: {str(e)}",
                backup_path=backup_path,
                original_path=str(full_path)
            )
    
    def validate_integrity(self, file_path: str) -> bool:
        """
        Validate file integrity.
        
        Args:
            file_path: Path to the file to validate
            
        Returns:
            True if file is valid
            
        Raises:
            FileIntegrityError: If validation fails
        """
        full_path = self.data_dir / file_path
        
        try:
            self._validate_file_integrity(full_path)
            return True
        except FileIntegrityError:
            return False
    
    @contextmanager
    def _get_file_lock(self, file_path: Path, lock_type: str):
        """
        Context manager for file locking using threading locks.
        
        Args:
            file_path: Path to the file to lock
            lock_type: Type of lock ('read' or 'write')
        """
        # Simple file-level locking using threading locks
        lock_key = str(file_path)
        if lock_key not in self._locks:
            self._locks[lock_key] = threading.RLock()
        
        file_lock = self._locks[lock_key]
        
        try:
            file_lock.acquire()
            yield
        except Exception as e:
            raise LockError(
                f"Failed to acquire {lock_type} lock for {file_path}: {str(e)}",
                file_path=str(file_path),
                lock_type=lock_type
            )
        finally:
            file_lock.release()
    
    def _validate_file_integrity(self, file_path: Path) -> None:
        """Validate file integrity using checksums."""
        if not file_path.exists():
            return
        
        try:
            # Basic file validation
            if file_path.stat().st_size == 0:
                raise FileIntegrityError(
                    f"File is empty: {file_path}",
                    file_path=str(file_path)
                )
            
            # JSON syntax validation
            with open(file_path, 'r', encoding='utf-8') as f:
                json.load(f)
                
        except json.JSONDecodeError as e:
            raise FileIntegrityError(
                f"Invalid JSON in file {file_path}: {str(e)}",
                file_path=str(file_path)
            )
    
    def _validate_json_structure(self, data: Dict[str, Any], file_path: str) -> None:
        """Validate JSON structure based on file type."""
        if 'Credentials.json' in file_path:
            # Validate credentials structure
            if not isinstance(data, dict):
                raise FileIntegrityError(
                    f"Invalid credentials structure in {file_path}",
                    file_path=file_path
                )
        elif 'Collaboration.json' in file_path:
            # Validate collaboration structure
            required_keys = ['invites', 'chat_sessions', 'message_counter']
            if not all(key in data for key in required_keys):
                raise FileIntegrityError(
                    f"Invalid collaboration structure in {file_path}",
                    file_path=file_path
                )
    
    def _calculate_checksum(self, file_path: Path) -> str:
        """Calculate SHA-256 checksum of file."""
        hash_sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(4096), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()
    
    def _find_latest_backup(self, file_path: str) -> Optional[str]:
        """Find the most recent backup for a file."""
        full_path = self.data_dir / file_path
        backup_pattern = f"{full_path.stem}_*.backup"
        
        backups = list(self.backup_dir.glob(backup_pattern))
        if not backups:
            return None
        
        # Sort by modification time (newest first)
        backups.sort(key=lambda x: x.stat().st_mtime, reverse=True)
        return str(backups[0])
