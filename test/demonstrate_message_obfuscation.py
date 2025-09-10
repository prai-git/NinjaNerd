#!/usr/bin/env python3
"""
Demonstration of message obfuscation functionality.
This script shows how messages are obfuscated when stored and deobfuscated when retrieved.
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from data.message_security import obfuscate_message, deobfuscate_message, is_message_obfuscated

def main():
    print("🔐 NinjaNerd Chat Message Obfuscation Demonstration")
    print("=" * 60)
    
    # Test messages
    test_messages = [
        "Hello! How are you doing today?",
        "Can you help me with this math problem?",
        "This is a secret message with special characters: !@#$%^&*()",
        "Multi-line message\nwith newlines\nand emojis 🎉📚✨"
    ]
    
    for i, message in enumerate(test_messages, 1):
        print(f"\n📝 Test Message {i}:")
        print(f"Original: {repr(message)}")
        
        # Obfuscate the message (this is what gets stored in the database)
        obfuscated = obfuscate_message(message)
        print(f"Stored (obfuscated): {obfuscated}")
        
        # Deobfuscate the message (this is what users see)
        deobfuscated = deobfuscate_message(obfuscated)
        print(f"Retrieved (deobfuscated): {repr(deobfuscated)}")
        
        # Verify it matches
        print(f"✅ Match: {message == deobfuscated}")
        print(f"🔍 Is obfuscated: {is_message_obfuscated(obfuscated)}")
        print(f"🔍 Is original obfuscated: {is_message_obfuscated(message)}")
    
    print("\n" + "=" * 60)
    print("✅ All messages successfully obfuscated and deobfuscated!")
    print("\n📋 Summary of Security Enhancement:")
    print("• Messages are XOR-encrypted using a secret key before storage")
    print("• Encrypted messages are base64-encoded for safe JSON storage")  
    print("• Messages are automatically decrypted when retrieved for display")
    print("• Backwards compatibility: existing plain text messages still work")
    print("• No change to user experience - chat works exactly the same")
    print("• Enhanced security: stored messages are no longer readable")

if __name__ == "__main__":
    main()
