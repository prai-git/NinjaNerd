#!/usr/bin/env python3
"""
Debug test to understand the complete message flow in SQLite database integration.
This test traces how messages are sent, stored, and retrieved between two users.
"""

import sys
import os
import tempfile
import shutil
from datetime import datetime

# Add the parent directory to the path so we can import the app
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db, reset_app_db
from core.message_security import obfuscate_message, deobfuscate_message, is_message_obfuscated, OBFUSCATION_PREFIX


def test_complete_message_flow():
    """Test the complete message flow between two users A and B."""
    print("\n" + "="*60)
    print("TESTING COMPLETE MESSAGE FLOW IN SQLITE DATABASE")
    print("="*60)
    
    # Set up temporary directory
    temp_dir = tempfile.mkdtemp()
    data_dir = os.path.join(temp_dir, 'data')
    os.makedirs(data_dir)
    
    try:
        # Set up environment for obfuscation
        os.environ['MESSAGE_OBFUSCATION_KEY'] = '12345'
        app.config['SECRET_KEY'] = 'test-secret-key'
        
        # Reset and initialize test database
        reset_app_db()
        db = initialize_app_db(app,
                             db_path=os.path.join(data_dir, 'debug_test.db'),
                             max_connections=5,
                             enable_message_obfuscation=True)
        db = get_app_db()
        
        print(f"\n1. Database initialized with obfuscation enabled: {db.config['enable_message_obfuscation']}")
        print(f"   Message obfuscator present: {db.message_obfuscator is not None}")
        
        # Create test users A and B
        user_a = 'alice@example.com'
        user_b = 'bob@example.com'
        
        db.create_user(user_a, 'password_hash_a', 'Test School')
        db.create_user(user_b, 'password_hash_b', 'Test School')
        print(f"\n2. Created users: {user_a} and {user_b}")
        
        # Create a chat session
        session_id = db.create_chat_session(user_a, user_b)
        print(f"\n3. Created chat session: {session_id}")
        
        # Test 1: User A sends "hi" to User B
        print(f"\n4. USER A SENDS MESSAGE 'hi' TO USER B")
        print("-" * 40)
        
        message_id_1 = db.add_message(session_id, user_a, user_b, 'hi')
        print(f"   Message ID: {message_id_1}")
        
        # Check what's stored in the database
        print("\n   Checking raw database storage...")
        collaboration_data = db.load_collaboration_data()
        if 'chat_sessions' in collaboration_data and session_id in collaboration_data['chat_sessions']:
            session_data = collaboration_data['chat_sessions'][session_id]
            stored_messages = session_data.get('messages', [])
            for msg in stored_messages:
                if msg['id'] == message_id_1:
                    print(f"   Stored message content: '{msg['message']}'")
                    print(f"   Is obfuscated: {is_message_obfuscated(msg['message'])}")
                    if is_message_obfuscated(msg['message']):
                        try:
                            deobf = deobfuscate_message(msg['message'])
                            print(f"   Deobfuscated: '{deobf}'")
                        except Exception as e:
                            print(f"   Deobfuscation error: {e}")
                    break
        
        # Test what User B retrieves
        print("\n   What User B retrieves...")
        messages_for_b = db.get_chat_messages(user_b, user_a)
        print(f"   Number of messages: {len(messages_for_b)}")
        for msg in messages_for_b:
            if msg.get('from_user') == user_a:
                print(f"   Retrieved message: '{msg['message']}'")
                print(f"   Is obfuscated: {is_message_obfuscated(msg['message'])}")
                break
        
        # Test 2: User B sends "hello" to User A
        print(f"\n5. USER B SENDS MESSAGE 'hello' TO USER A")
        print("-" * 40)
        
        message_id_2 = db.add_message(session_id, user_b, user_a, 'hello')
        print(f"   Message ID: {message_id_2}")
        
        # Check what's stored in the database
        print("\n   Checking raw database storage...")
        collaboration_data = db.load_collaboration_data()
        if 'chat_sessions' in collaboration_data and session_id in collaboration_data['chat_sessions']:
            session_data = collaboration_data['chat_sessions'][session_id]
            stored_messages = session_data.get('messages', [])
            for msg in stored_messages:
                if msg['id'] == message_id_2:
                    print(f"   Stored message content: '{msg['message']}'")
                    print(f"   Is obfuscated: {is_message_obfuscated(msg['message'])}")
                    if is_message_obfuscated(msg['message']):
                        try:
                            deobf = deobfuscate_message(msg['message'])
                            print(f"   Deobfuscated: '{deobf}'")
                        except Exception as e:
                            print(f"   Deobfuscation error: {e}")
                    break
        
        # Test what User A retrieves
        print("\n   What User A retrieves...")
        messages_for_a = db.get_chat_messages(user_a, user_b)
        print(f"   Number of messages: {len(messages_for_a)}")
        for msg in messages_for_a:
            if msg.get('from_user') == user_b:
                print(f"   Retrieved message: '{msg['message']}'")
                print(f"   Is obfuscated: {is_message_obfuscated(msg['message'])}")
                break
        
        # Test 3: Show all messages from both perspectives
        print(f"\n6. COMPLETE MESSAGE HISTORY")
        print("-" * 40)
        
        print(f"\n   From {user_a}'s perspective:")
        messages_for_a = db.get_chat_messages(user_a, user_b)
        for i, msg in enumerate(messages_for_a):
            print(f"     {i+1}. From {msg['from_user']}: '{msg['message']}'")
            print(f"        Obfuscated: {is_message_obfuscated(msg['message'])}")
        
        print(f"\n   From {user_b}'s perspective:")
        messages_for_b = db.get_chat_messages(user_b, user_a)
        for i, msg in enumerate(messages_for_b):
            print(f"     {i+1}. From {msg['from_user']}: '{msg['message']}'")
            print(f"        Obfuscated: {is_message_obfuscated(msg['message'])}")
        
        # Test 4: Test the core obfuscation functions directly
        print(f"\n7. TESTING CORE OBFUSCATION FUNCTIONS")
        print("-" * 40)
        
        test_msg = "hi"
        obfuscated = obfuscate_message(test_msg)
        print(f"   Original: '{test_msg}'")
        print(f"   Obfuscated: '{obfuscated}'")
        print(f"   Has prefix: {obfuscated.startswith(OBFUSCATION_PREFIX)}")
        print(f"   Is detected as obfuscated: {is_message_obfuscated(obfuscated)}")
        
        try:
            deobfuscated = deobfuscate_message(obfuscated)
            print(f"   Deobfuscated: '{deobfuscated}'")
            print(f"   Round trip successful: {deobfuscated == test_msg}")
        except Exception as e:
            print(f"   Deobfuscation error: {e}")
        
        print(f"\n" + "="*60)
        print("MESSAGE FLOW ANALYSIS COMPLETE")
        print("="*60)
        
    finally:
        # Cleanup
        shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    test_complete_message_flow()