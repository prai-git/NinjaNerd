"""
Queue management system for concurrent database operations.

This module provides priority-based queuing for read/write operations
with timeout handling and performance monitoring.
"""

import threading
import queue
import time
import logging
from concurrent.futures import ThreadPoolExecutor, Future, TimeoutError
from enum import Enum
from typing import Callable, Any, Dict, Optional
from dataclasses import dataclass
from datetime import datetime

from .exceptions import QueueTimeoutError, ConcurrencyError


class Priority(Enum):
    """Operation priority levels."""
    CRITICAL = 1    # Authentication, login/logout
    HIGH = 2       # User operations, session management
    NORMAL = 3     # General operations
    LOW = 4        # Background tasks, cleanup


class OperationType(Enum):
    """Types of database operations."""
    READ = "read"
    WRITE = "write"


@dataclass
class QueuedOperation:
    """Represents a queued operation."""
    operation_func: Callable
    priority: Priority
    operation_type: OperationType
    created_at: datetime
    user_id: Optional[str] = None
    operation_id: Optional[str] = None


class QueueManager:
    """
    Manages operation queues for concurrent access.
    
    Features:
    - Priority-based queuing
    - Read/write operation separation
    - Timeout handling
    - Performance monitoring
    """
    
    def __init__(self, max_workers: int = 10, timeout: int = 30):
        """
        Initialize queue manager.
        
        Args:
            max_workers: Maximum number of worker threads
            timeout: Default operation timeout in seconds
        """
        self.max_workers = max_workers
        self.timeout = timeout
        
        # Separate executors for read and write operations
        self._read_executor = ThreadPoolExecutor(
            max_workers=max_workers,
            thread_name_prefix="db_read"
        )
        self._write_executor = ThreadPoolExecutor(
            max_workers=1,  # Single writer to prevent conflicts
            thread_name_prefix="db_write"
        )
        
        # Priority queues for write operations
        self._write_queues = {
            Priority.CRITICAL: queue.PriorityQueue(),
            Priority.HIGH: queue.PriorityQueue(),
            Priority.NORMAL: queue.PriorityQueue(),
            Priority.LOW: queue.PriorityQueue()
        }
        
        # Statistics tracking
        self._stats = {
            'operations_completed': 0,
            'operations_failed': 0,
            'average_wait_time': 0.0,
            'queue_sizes': {p: 0 for p in Priority}
        }
        
        # Write operation coordinator
        self._write_coordinator = threading.Thread(
            target=self._coordinate_writes,
            daemon=True
        )
        self._shutdown = threading.Event()
        self._write_coordinator.start()
        
        self._logger = logging.getLogger(__name__)
    
    def submit_read_operation(self, operation_func: Callable, user_id: Optional[str] = None) -> Future:
        """
        Submit a read operation for execution.
        
        Args:
            operation_func: Function to execute
            user_id: Optional user ID for tracking
            
        Returns:
            Future object for the operation
        """
        try:
            future = self._read_executor.submit(self._execute_operation, operation_func, user_id)
            return future
        except Exception as e:
            self._logger.error(f"Failed to submit read operation: {e}")
            raise ConcurrencyError(
                f"Failed to submit read operation: {str(e)}",
                resource="read_queue",
                operation="submit"
            )
    
    def submit_write_operation(
        self,
        operation_func: Callable,
        priority: Priority = Priority.NORMAL,
        user_id: Optional[str] = None,
        timeout: Optional[int] = None
    ) -> Future:
        """
        Submit a write operation for execution.
        
        Args:
            operation_func: Function to execute
            priority: Operation priority
            user_id: Optional user ID for tracking
            timeout: Operation timeout (uses default if None)
            
        Returns:
            Future object for the operation
        """
        if timeout is None:
            timeout = self.timeout
        
        operation = QueuedOperation(
            operation_func=operation_func,
            priority=priority,
            operation_type=OperationType.WRITE,
            created_at=datetime.now(),
            user_id=user_id,
            operation_id=f"{user_id or 'anon'}_{int(time.time() * 1000)}"
        )
        
        # Create future for the operation
        future = Future()
        
        # Add to appropriate priority queue
        try:
            queue_item = (priority.value, time.time(), operation, future)
            self._write_queues[priority].put(queue_item, timeout=timeout)
            self._stats['queue_sizes'][priority] = self._write_queues[priority].qsize()
            
            return future
            
        except queue.Full:
            raise QueueTimeoutError(
                f"Write queue full for priority {priority.name}",
                timeout_seconds=timeout,
                queue_size=self._write_queues[priority].qsize()
            )
    
    def get_queue_status(self) -> Dict[str, Any]:
        """
        Get current queue status and statistics.
        
        Returns:
            Dictionary containing queue status and statistics
        """
        # Update queue sizes
        for priority in Priority:
            self._stats['queue_sizes'][priority] = self._write_queues[priority].qsize()
        
        return {
            'read_executor': {
                'active_threads': self._read_executor._threads,
                'max_workers': self._read_executor._max_workers
            },
            'write_executor': {
                'active_threads': self._write_executor._threads,
                'max_workers': self._write_executor._max_workers
            },
            'queue_sizes': {p.name: size for p, size in self._stats['queue_sizes'].items()},
            'statistics': self._stats.copy(),
            'total_pending_writes': sum(self._stats['queue_sizes'].values())
        }
    
    def shutdown_gracefully(self, timeout: int = 60) -> None:
        """
        Shutdown queue manager gracefully.
        
        Args:
            timeout: Maximum time to wait for shutdown
        """
        self._logger.info("Initiating graceful shutdown of queue manager...")
        
        # Signal shutdown
        self._shutdown.set()
        
        # Wait for write coordinator to finish
        self._write_coordinator.join(timeout=timeout)
        
        # Shutdown executors
        self._read_executor.shutdown(wait=True)
        self._write_executor.shutdown(wait=True)
        
        self._logger.info("Queue manager shutdown complete")
    
    def _coordinate_writes(self) -> None:
        """Coordinate write operations by priority."""
        while not self._shutdown.is_set():
            try:
                # Check queues in priority order
                for priority in Priority:
                    if not self._write_queues[priority].empty():
                        try:
                            # Get operation from queue (non-blocking)
                            queue_item = self._write_queues[priority].get_nowait()
                            _, timestamp, operation, future = queue_item
                            
                            # Calculate wait time
                            wait_time = (datetime.now() - operation.created_at).total_seconds()
                            self._update_wait_time_stats(wait_time)
                            
                            # Submit to write executor
                            executor_future = self._write_executor.submit(
                                self._execute_operation,
                                operation.operation_func,
                                operation.user_id
                            )
                            
                            # Transfer result to original future
                            self._transfer_future_result(executor_future, future)
                            
                            break  # Process one operation per iteration
                            
                        except queue.Empty:
                            continue
                        except Exception as e:
                            self._logger.error(f"Error processing write operation: {e}")
                            if 'future' in locals():
                                future.set_exception(e)
                
                # Small delay to prevent busy waiting
                time.sleep(0.001)
                
            except Exception as e:
                self._logger.error(f"Error in write coordinator: {e}")
                time.sleep(0.1)
    
    def _execute_operation(self, operation_func: Callable, user_id: Optional[str] = None) -> Any:
        """Execute an operation with error handling and statistics tracking."""
        start_time = time.time()
        
        try:
            result = operation_func()
            self._stats['operations_completed'] += 1
            return result
            
        except Exception as e:
            self._stats['operations_failed'] += 1
            self._logger.error(f"Operation failed for user {user_id}: {e}")
            raise
        
        finally:
            execution_time = time.time() - start_time
            self._logger.debug(f"Operation completed in {execution_time:.3f}s for user {user_id}")
    
    def _transfer_future_result(self, source_future: Future, target_future: Future) -> None:
        """Transfer result from source future to target future."""
        def transfer():
            try:
                result = source_future.result()
                target_future.set_result(result)
            except Exception as e:
                target_future.set_exception(e)
        
        # Run transfer in a separate thread to avoid blocking
        threading.Thread(target=transfer, daemon=True).start()
    
    def _update_wait_time_stats(self, wait_time: float) -> None:
        """Update average wait time statistics."""
        current_avg = self._stats['average_wait_time']
        completed = self._stats['operations_completed']
        
        if completed == 0:
            self._stats['average_wait_time'] = wait_time
        else:
            # Calculate running average
            self._stats['average_wait_time'] = (
                (current_avg * completed + wait_time) / (completed + 1)
            )
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.shutdown_gracefully()
