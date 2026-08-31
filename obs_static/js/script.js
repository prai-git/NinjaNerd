// NinjaNerd JavaScript utilities
document.addEventListener('DOMContentLoaded', function() {
    // Add fade-in animation to cards
    const cards = document.querySelectorAll('.card');
    cards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.1}s`;
        card.classList.add('fade-in-up');
    });

    // Add loading states to buttons - EXCLUDE login forms to prevent submission blocking
    const buttons = document.querySelectorAll('button[type="submit"]:not([data-no-loading])');
    buttons.forEach(button => {
        // Skip buttons in login or create account forms
        const form = button.closest('form');
        if (form && (form.action.includes('/login') || form.action.includes('/create_account'))) {
            return; // Skip login/create account forms
        }
        
        button.addEventListener('click', function(e) {
            // Only add loading state if form is valid, but don't prevent submission
            if (this.form && this.form.checkValidity()) {
                // Set a small delay to show the loading state, then let form submit
                setTimeout(() => {
                    this.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Processing...';
                    this.disabled = true;
                }, 50);
            }
        });
    });

    // Add hover effects to topic cards
    const topicCards = document.querySelectorAll('.topic-card');
    topicCards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.classList.add('bounce');
        });
        
        card.addEventListener('mouseleave', function() {
            this.classList.remove('bounce');
        });
    });

    // Auto-focus on first input field
    const firstInput = document.querySelector('input:not([type="hidden"])');
    if (firstInput) {
        firstInput.focus();
    }

    // Add enter key support for forms
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                const submitBtn = form.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.click();
                }
            }
        });
    });
});

// Utility functions
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.zIndex = '9999';
    notification.style.minWidth = '300px';
    
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

function animateProgress(element, targetWidth) {
    let currentWidth = 0;
    const increment = targetWidth / 20;
    
    const interval = setInterval(() => {
        currentWidth += increment;
        if (currentWidth >= targetWidth) {
            currentWidth = targetWidth;
            clearInterval(interval);
        }
        element.style.width = currentWidth + '%';
        element.setAttribute('aria-valuenow', currentWidth);
    }, 50);
}

// Session management
function checkSession() {
    fetch('/check_session')
        .then(response => response.json())
        .then(data => {
            if (!data.valid) {
                window.location.href = '/login';
            }
        })
        .catch(error => {
            console.error('Session check failed:', error);
        });
}

// Check session every 5 minutes
setInterval(checkSession, 5 * 60 * 1000);

// Prevent form resubmission on page refresh
if (window.history.replaceState) {
    window.history.replaceState(null, null, window.location.href);
}