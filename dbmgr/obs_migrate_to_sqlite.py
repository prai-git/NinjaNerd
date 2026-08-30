"""
Migration script for NinjaNerd application.
Migrates data from JSON files to SQLite database.
"""

import os
import json
import logging
from pathlib import Path
from datetime import datetime
from .sqlite_app_integration import initialize_app_db, SQLiteAppIntegration
from flask import Flask


def setup_logging():
    """Setup logging for migration."""
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler('migration.log'),
            logging.StreamHandler()
        ]
    )
    return logging.getLogger(__name__)


def migrate_json_to_sqlite(data_dir: str = 'data', db_path: str = None):
    """
    Migrate data from JSON files to SQLite database.
    
    Args:
        data_dir: Directory containing JSON files
        db_path: Path to SQLite database (optional, defaults to data/ninjanerd.db)
    """
    logger = setup_logging()
    logger.info("Starting JSON to SQLite migration...")
    
    # Create a minimal Flask app for initialization
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'migration-key-temp'
    
    try:
        # Initialize SQLite integration with correct database name
        if db_path:
            sqlite_integration = initialize_app_db(app, db_path=db_path)
        else:
            # Use ninjanerd.db as the default name (not ninjnerd.db)
            default_db_path = Path(data_dir) / 'ninjanerd.db'
            sqlite_integration = initialize_app_db(app, db_path=str(default_db_path))
        
        # Paths to JSON files
        credentials_file = Path(data_dir) / 'Credentials.json'
        collaboration_file = Path(data_dir) / 'Collaboration.json'
        
        # Migrate credentials
        if credentials_file.exists():
            logger.info("Migrating credentials data...")
            with open(credentials_file, 'r') as f:
                credentials_data = json.load(f)
            
            success = sqlite_integration.save_credentials(credentials_data)
            if success:
                logger.info(f"Successfully migrated {len(credentials_data)} user accounts")
            else:
                logger.error("Failed to migrate credentials data")
                return False
        else:
            logger.warning(f"Credentials file not found: {credentials_file}")
        
        # Migrate collaboration data
        if collaboration_file.exists():
            logger.info("Migrating collaboration data...")
            with open(collaboration_file, 'r') as f:
                collaboration_data = json.load(f)
            
            success = sqlite_integration.save_collaboration_data(collaboration_data)
            if success:
                invites_count = len(collaboration_data.get('invites', {}))
                sessions_count = len(collaboration_data.get('chat_sessions', {}))
                
                # Count total messages
                total_messages = 0
                for session in collaboration_data.get('chat_sessions', {}).values():
                    total_messages += len(session.get('messages', []))
                
                logger.info(f"Successfully migrated:")
                logger.info(f"  - {invites_count} invites")
                logger.info(f"  - {sessions_count} chat sessions")
                logger.info(f"  - {total_messages} messages")
            else:
                logger.error("Failed to migrate collaboration data")
                return False
        else:
            logger.warning(f"Collaboration file not found: {collaboration_file}")
        
        # Verify migration
        logger.info("Verifying migration...")
        stats = sqlite_integration.get_statistics()
        logger.info(f"Database statistics after migration:")
        logger.info(f"  - Total users: {stats.get('total_users', 0)}")
        logger.info(f"  - Active sessions: {stats.get('active_sessions', 0)}")
        logger.info(f"  - Total messages: {stats.get('total_messages', 0)}")
        logger.info(f"  - Pending invites: {stats.get('pending_invites', 0)}")
        
        # Health check
        health = sqlite_integration.health_check()
        if health['status'] == 'healthy':
            logger.info("Database health check passed")
        else:
            logger.error(f"Database health check failed: {health.get('error')}")
            return False
        
        logger.info("Migration completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Migration failed: {e}")
        return False
    finally:
        # Cleanup
        if 'sqlite_integration' in locals():
            sqlite_integration._cleanup()


def backup_json_files(data_dir: str = 'data', backup_suffix: str = None):
    """
    Create backup copies of JSON files before migration.
    
    Args:
        data_dir: Directory containing JSON files
        backup_suffix: Suffix for backup files (default: timestamp)
    """
    logger = setup_logging()
    
    if backup_suffix is None:
        backup_suffix = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    data_path = Path(data_dir)
    json_files = ['Credentials.json', 'Collaboration.json']
    
    for json_file in json_files:
        source_file = data_path / json_file
        if source_file.exists():
            backup_file = data_path / f"{json_file}.backup_{backup_suffix}"
            
            try:
                import shutil
                shutil.copy2(source_file, backup_file)
                logger.info(f"Backed up {json_file} to {backup_file}")
            except Exception as e:
                logger.error(f"Failed to backup {json_file}: {e}")
                return False
    
    return True


def cleanup_old_database_files(data_dir: str = 'data'):
    """
    Remove old database files with incorrect naming.
    
    Args:
        data_dir: Directory containing database files
    """
    logger = setup_logging()
    
    data_path = Path(data_dir)
    old_files = ['ninjnerd.db', 'ninjnerd.db-shm', 'ninjnerd.db-wal']
    
    for old_file in old_files:
        file_path = data_path / old_file
        if file_path.exists():
            try:
                file_path.unlink()
                logger.info(f"Removed old database file: {old_file}")
            except Exception as e:
                logger.error(f"Failed to remove {old_file}: {e}")
                return False
    
    return True


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Migrate NinjaNerd from JSON to SQLite")
    parser.add_argument(
        "--data-dir",
        default="data",
        help="Directory containing JSON files (default: data)"
    )
    parser.add_argument(
        "--db-path",
        help="Path to SQLite database file (default: data/ninjanerd.db)"
    )
    parser.add_argument(
        "--backup",
        action="store_true",
        help="Create backup of JSON files before migration"
    )
    parser.add_argument(
        "--backup-suffix",
        help="Suffix for backup files (default: timestamp)"
    )
    parser.add_argument(
        "--cleanup-old",
        action="store_true",
        help="Remove old database files with incorrect naming"
    )
    
    args = parser.parse_args()
    
    # Create backup if requested
    if args.backup:
        print("Creating backup of JSON files...")
        if not backup_json_files(args.data_dir, args.backup_suffix):
            print("Failed to create backup. Aborting migration.")
            exit(1)
        print("Backup completed.")
    
    # Cleanup old files if requested
    if args.cleanup_old:
        print("Cleaning up old database files...")
        if not cleanup_old_database_files(args.data_dir):
            print("Failed to cleanup old files.")
            exit(1)
        print("Cleanup completed.")
    
    # Run migration
    print("Starting migration from JSON to SQLite...")
    success = migrate_json_to_sqlite(args.data_dir, args.db_path)
    
    if success:
        print("Migration completed successfully!")
        print("Database created with correct naming: ninjanerd.db")
        print("You can now update your application configuration to use SQLite.")
    else:
        print("Migration failed. Please check the migration.log file for details.")
        exit(1)
