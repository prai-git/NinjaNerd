#!/usr/bin/env python3
"""
Test script to adjust timestamps in the database for testing purposes.

Usage:
    python -m pytest test/test_tweak_dates.py -u user@example.com -c 10  # Move account creation date back by 10 days for specific user
    python -m pytest test/test_tweak_dates.py -u user@example.com -p 10  # Move payment dates back by 10 days for specific user
    python -m pytest test/test_tweak_dates.py                            # Do nothing (no arguments)
"""

import sys
import os
import sqlite3
import argparse
from datetime import datetime, timedelta

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def test_tweak_dates():
    """Main test function that processes command line arguments and adjusts dates"""
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Adjust timestamps in database for testing')
    parser.add_argument('-u', '--username', type=str, metavar='EMAIL', 
                       help='Username (email) to adjust timestamps for', required=False)
    parser.add_argument('-c', '--creation', type=int, metavar='DAYS', 
                       help='Move account creation dates back by specified days (1-30)',
                       choices=range(1, 31))
    parser.add_argument('-p', '--payment', type=int, metavar='DAYS',
                       help='Move payment dates back by specified days (1-30)', 
                       choices=range(1, 31))
    
    # Get arguments from pytest command line
    args = []
    if len(sys.argv) > 1:
        # Filter out pytest-specific arguments
        for arg in sys.argv[1:]:
            if arg.startswith('-u') or arg.startswith('--username'):
                if '=' in arg:
                    args.extend(arg.split('='))
                else:
                    args.append(arg)
            elif arg.startswith('-c') or arg.startswith('--creation'):
                if '=' in arg:
                    args.extend(arg.split('='))
                else:
                    args.append(arg)
            elif arg.startswith('-p') or arg.startswith('--payment'):
                if '=' in arg:
                    args.extend(arg.split('='))
                else:
                    args.append(arg)
            elif '@' in arg or (arg.isdigit() and len(args) > 0):
                # This is likely an email or a number following an option
                args.append(arg)
    
    try:
        parsed_args = parser.parse_args(args)
    except SystemExit:
        # No valid arguments provided, do nothing
        print("ℹ️  No valid arguments provided. Nothing to do.")
        return

    username = parsed_args.username
    creation_days = parsed_args.creation
    payment_days = parsed_args.payment
    
    if not creation_days and not payment_days:
        print("ℹ️  No arguments provided. Nothing to do.")
        return
    
    if not username:
        print("❌ Username (-u) is required when using -c or -p options.")
        print("   Usage: python -m pytest test/test_tweak_dates.py -u email@example.com -c 10")
        return
    
    # Database path
    db_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'ninjanerd.db')
    
    if not os.path.exists(db_path):
        print(f"❌ Database not found at: {db_path}")
        return
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Handle account creation date adjustment
        if creation_days:
            print(f"\n📅 Adjusting account creation date by {creation_days} days for user: {username}")
            
            # Get current creation date for the specific user
            cursor.execute("SELECT email, created_at FROM users WHERE email = ? AND created_at IS NOT NULL", (username,))
            user = cursor.fetchone()
            
            if not user:
                print(f"   ❌ User '{username}' not found or has no creation date.")
            else:
                email, created_at = user
                # Parse current timestamp
                current_dt = datetime.fromisoformat(created_at)
                # Calculate new timestamp (move back by specified days)
                new_dt = current_dt - timedelta(days=creation_days)
                new_timestamp = new_dt.strftime('%Y-%m-%d %H:%M:%S')
                
                print(f"   📧 {email}")
                print(f"      Before: {created_at}")
                print(f"      After:  {new_timestamp}")
                
                # Update the database
                cursor.execute(
                    "UPDATE users SET created_at = ? WHERE email = ?",
                    (new_timestamp, email)
                )
                
                conn.commit()
                print(f"   ✅ Successfully updated account creation date for {email}")
        
        # Handle payment date adjustment  
        if payment_days:
            print(f"\n💳 Adjusting payment dates by {payment_days} days for user: {username}")
            
            # Get current payment dates for the specific user (only completed payments)
            cursor.execute("""
                SELECT up.id, u.email, up.payment_timestamp, up.expiry_timestamp 
                FROM user_payments up 
                JOIN users u ON up.user_id = u.id 
                WHERE u.email = ? AND up.status = 'completed' AND up.payment_timestamp IS NOT NULL
            """, (username,))
            payments = cursor.fetchall()
            
            if not payments:
                print(f"   ❌ No completed payments with timestamps found for user '{username}'.")
            else:
                print(f"   Found {len(payments)} completed payments with timestamps for {username}:")
                
                for payment_id, email, payment_timestamp, expiry_timestamp in payments:
                    # Parse current payment timestamp
                    current_payment_dt = datetime.fromisoformat(payment_timestamp)
                    # Calculate new payment timestamp (move back by specified days)
                    new_payment_dt = current_payment_dt - timedelta(days=payment_days)
                    new_payment_timestamp = new_payment_dt.strftime('%Y-%m-%d %H:%M:%S')
                    
                    print(f"   💳 Payment ID: {payment_id} - {email}")
                    print(f"      Payment Before: {payment_timestamp}")
                    print(f"      Payment After:  {new_payment_timestamp}")
                    
                    # Handle expiry timestamp if it exists
                    new_expiry_timestamp = None
                    if expiry_timestamp:
                        current_expiry_dt = datetime.fromisoformat(expiry_timestamp.replace('T', ' ').replace('Z', ''))
                        new_expiry_dt = current_expiry_dt - timedelta(days=payment_days)
                        new_expiry_timestamp = new_expiry_dt.strftime('%Y-%m-%dT%H:%M:%S.%f')
                        print(f"      Expiry Before:  {expiry_timestamp}")
                        print(f"      Expiry After:   {new_expiry_timestamp}")
                    
                    # Update the database for this specific payment record
                    if new_expiry_timestamp:
                        cursor.execute(
                            "UPDATE user_payments SET payment_timestamp = ?, expiry_timestamp = ? WHERE id = ?",
                            (new_payment_timestamp, new_expiry_timestamp, payment_id)
                        )
                    else:
                        cursor.execute(
                            "UPDATE user_payments SET payment_timestamp = ? WHERE id = ?",
                            (new_payment_timestamp, payment_id)
                        )
                
                conn.commit()
                print(f"   ✅ Successfully updated {len(payments)} payment dates for {username}")
        
        conn.close()
        print(f"\n🎯 Date adjustment completed successfully!")
        
    except Exception as e:
        print(f"❌ Error adjusting dates: {e}")
        if 'conn' in locals():
            conn.rollback()
            conn.close()
        raise

if __name__ == "__main__":
    test_tweak_dates()