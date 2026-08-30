"""
Core security and utility modules for NinjaNerd application.
Provides concurrency control, input sanitization, and safe service facades.
"""

from .concurrency_utils import (
    initialize_concurrency_manager, 
    synchronized, 
    thread_safe_operation,
    LOCK_ACTIVE_SESSIONS, 
    LOCK_COLLABORATION_INVITES, 
    LOCK_CHAT_SESSIONS,
    LOCK_COLLABORATION_DATA, 
    LOCK_MESSAGE_COUNTER, 
    LOCK_CREDENTIALS
)

from .safe_llm_facade import (
    get_safe_llm_service, 
    initialize_safe_llm_service
)

from .input_sanitizer import (
    get_input_validator, 
    sanitize_input
)

__all__ = [
    'initialize_concurrency_manager', 
    'synchronized', 
    'thread_safe_operation',
    'LOCK_ACTIVE_SESSIONS', 
    'LOCK_COLLABORATION_INVITES', 
    'LOCK_CHAT_SESSIONS',
    'LOCK_COLLABORATION_DATA', 
    'LOCK_MESSAGE_COUNTER', 
    'LOCK_CREDENTIALS',
    'get_safe_llm_service', 
    'initialize_safe_llm_service',
    'get_input_validator', 
    'sanitize_input'
]
