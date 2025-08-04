from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_session import Session
from dotenv import load_dotenv
import json
import os
import logging
from logging.handlers import RotatingFileHandler
import requests
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import uuid
import ssl

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
app.secret_key = os.urandom(24)

# Configure session to use filesystem
app.config['SESSION_TYPE'] = 'filesystem'
app.config['SESSION_PERMANENT'] = False
Session(app)

# Environment variables
LLM_ENDPOINT = os.getenv('PR_LLM_ENDPOINT', '')
LLM_API_KEY = os.getenv('PR_LLM_API_KEY', '')
LOGO_PATH = os.getenv('PR_NIBODH_LOGO', '/static/images/logo.png')

# Setup logging with circular buffer
if not os.path.exists('logs'):
    os.makedirs('logs')

log_handler = RotatingFileHandler('logs/ninja_nerd.log', maxBytes=10*1024*1024, backupCount=5)
log_handler.setFormatter(logging.Formatter(
    '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
))
log_handler.setLevel(logging.INFO)
app.logger.addHandler(log_handler)
app.logger.setLevel(logging.INFO)

# Database file paths
CREDENTIALS_FILE = 'data/Credentials.json'
COLLABORATION_FILE = 'data/Collaboration.json'

# Global storage for active sessions and collaboration data
active_sessions = {}  # {username: {session_id, last_activity, school_name, current_topic, grade}}
collaboration_invites = {}  # {invite_id: {from_user, to_user, timestamp, status}}
chat_sessions = {}  # {session_id: {user1, user2, messages, active}}

def init_credentials_db():
    """Initialize credentials database with default admin user"""
    if not os.path.exists(CREDENTIALS_FILE):
        default_data = {
            "admin@gmail.com": {
                "password": generate_password_hash("adminatgmaildotcom"),
                "school_name": "NinjaNerd Academy",
                "history": [],
                "statistics": {
                    "questions_attempted": 0,
                    "topics_covered": [],
                    "last_login": None
                }
            }
        }
        with open(CREDENTIALS_FILE, 'w') as f:
            json.dump(default_data, f, indent=2)

def init_collaboration_db():
    """Initialize collaboration database"""
    if not os.path.exists(COLLABORATION_FILE):
        default_data = {
            "invites": {},
            "chat_sessions": {},
            "message_counter": 0
        }
        with open(COLLABORATION_FILE, 'w') as f:
            json.dump(default_data, f, indent=2)

def load_credentials():
    """Load credentials from JSON file"""
    try:
        with open(CREDENTIALS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        init_credentials_db()
        return load_credentials()

def save_credentials(data):
    """Save credentials to JSON file"""
    with open(CREDENTIALS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_collaboration_data():
    """Load collaboration data from JSON file"""
    try:
        with open(COLLABORATION_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        init_collaboration_db()
        return load_collaboration_data()

def save_collaboration_data(data):
    """Save collaboration data to JSON file"""
    with open(COLLABORATION_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def cleanup_old_sessions():
    """Remove inactive sessions older than 30 minutes"""
    cutoff_time = datetime.now() - timedelta(minutes=30)
    to_remove = []
    
    for username, session_data in active_sessions.items():
        if datetime.fromisoformat(session_data['last_activity']) < cutoff_time:
            to_remove.append(username)
    
    for username in to_remove:
        del active_sessions[username]

def update_user_activity(username):
    """Update user's last activity timestamp"""
    if username in active_sessions:
        active_sessions[username]['last_activity'] = datetime.now().isoformat()

def log_user_activity(username, activity):
    """Log user activity with timestamp"""
    app.logger.info(f"User: {username} | Activity: {activity}")

def load_prompt(topic):
    """Load prompt from topic file"""
    try:
        prompt_file = f"data/{topic.lower()}.txt"
        with open(prompt_file, 'r') as f:
            return f.read().strip()
    except FileNotFoundError:
        return f"Generate educational questions for {topic}"

def call_llm_api(prompt, user_history=[]):
    """Call DeepSeek R1 LLM API"""
    if not LLM_ENDPOINT or not LLM_API_KEY:
        # Mock response for development
        return generate_mock_questions(prompt)
    
    try:
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Bearer {LLM_API_KEY}'
        }
        
        # Include user history for difficulty adjustment
        enhanced_prompt = f"{prompt}\n\nUser History: {json.dumps(user_history[-10:])}" if user_history else prompt
        
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert educational content creator. Always respond with valid JSON only, no additional text or markdown formatting."
                },
                {
                    "role": "user", 
                    "content": enhanced_prompt
                }
            ],
            "model": "deepseek-chat",
            "max_tokens": 2048,
            "temperature": 0.7,
            "stream": False,
            "response_format": {
                "type": "text"
            }
        }
        
        response = requests.post(LLM_ENDPOINT, headers=headers, json=payload)
        response.raise_for_status()
        
        # Extract content from DeepSeek response format
        response_data = response.json()
        content = response_data['choices'][0]['message']['content']
        
        # Clean the content - remove markdown code blocks if present
        content = content.strip()
        if content.startswith('```json'):
            content = content[7:]  # Remove ```json
        if content.startswith('```'):
            content = content[3:]   # Remove ```
        if content.endswith('```'):
            content = content[:-3]  # Remove trailing ```
        content = content.strip()
        
        # Try to parse as JSON
        try:
            parsed_response = json.loads(content)
            return parsed_response
        except json.JSONDecodeError as je:
            app.logger.warning(f"JSON decode error: {str(je)}. Content: {content[:200]}...")
            # Fallback to mock questions
            return generate_mock_questions(prompt)
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 402:
            app.logger.warning("DeepSeek API credits exhausted, falling back to mock questions")
            return generate_mock_questions(prompt)
        else:
            app.logger.error(f"LLM API call failed: {str(e)}")
            return generate_mock_questions(prompt)
    except Exception as e:
        app.logger.error(f"LLM API call failed: {str(e)}")
        return generate_mock_questions(prompt)

def generate_mock_questions(prompt):
    """Generate mock questions when LLM API is unavailable"""
    # Extract topic from prompt or use generic
    topic = "general"
    if "math" in prompt.lower():
        topic = "math"
    elif "puzzle" in prompt.lower():
        topic = "puzzles"
    elif "story" in prompt.lower() or "reading" in prompt.lower():
        topic = "stories"
    elif "english" in prompt.lower() or "grammar" in prompt.lower():
        topic = "english"
    elif "science" in prompt.lower():
        topic = "science"
    elif "history" in prompt.lower():
        topic = "history"
    elif "geography" in prompt.lower():
        topic = "geography"
    
    mock_questions = {
        "math": [
            {
                "question": "If you have 12 apples and give away 5 apples, how many apples do you have left?",
                "hint": "Subtraction: Start with the total and take away what you gave.",
                "explanation": "12 - 5 = 7. You started with 12 apples and gave away 5, so you have 7 apples remaining."
            },
            {
                "question": "What is 8 × 7?",
                "hint": "Think of multiplication as repeated addition: 8 + 8 + 8 + 8 + 8 + 8 + 8",
                "explanation": "8 × 7 = 56. You can think of this as adding 8 seven times, or 7 eight times."
            }
        ],
        "puzzles": [
            {
                "question": "I have keys but no locks. I have space but no room. You can enter but not go outside. What am I?",
                "hint": "Think about something you use every day that has keys and space.",
                "explanation": "A keyboard! It has keys (letter keys), space (spacebar), and you can enter (Enter key) but not go outside."
            },
            {
                "question": "What comes next in this pattern: 2, 4, 6, 8, ?",
                "hint": "Look at the difference between each number.",
                "explanation": "10. This is a pattern of even numbers, each increasing by 2."
            }
        ],
        "stories": [
            {
                "question": "Read this sentence: 'The brave knight saved the princess from the dragon.' Who saved the princess?",
                "hint": "Look for the subject of the sentence - who performed the action?",
                "explanation": "The knight saved the princess. The knight is the subject who performed the action of saving."
            }
        ],
        "english": [
            {
                "question": "Which word is a noun in this sentence: 'The happy dog ran quickly'?",
                "hint": "A noun is a person, place, or thing.",
                "explanation": "'Dog' is the noun. Nouns name people, places, or things. 'Happy' is an adjective, 'ran' is a verb, and 'quickly' is an adverb."
            }
        ],
        "science": [
            {
                "question": "What are the three states of matter?",
                "hint": "Think about ice, water, and steam - what are their different forms?",
                "explanation": "The three states of matter are solid, liquid, and gas. Ice is solid, water is liquid, and steam is gas."
            }
        ],
        "history": [
            {
                "question": "Who was the first President of the United States?",
                "hint": "This person is often called the 'Father of His Country'.",
                "explanation": "George Washington was the first President of the United States, serving from 1789 to 1797."
            }
        ],
        "geography": [
            {
                "question": "What is the largest ocean on Earth?",
                "hint": "This ocean borders Asia, Australia, and the Americas.",
                "explanation": "The Pacific Ocean is the largest ocean on Earth, covering about one-third of the planet's surface."
            }
        ]
    }
    
    questions = mock_questions.get(topic, mock_questions["math"])
    return {"questions": questions[:2]}  # Return 2 questions

@app.route('/')
def index():
    return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        
        credentials = load_credentials()
        
        if username in credentials and check_password_hash(credentials[username]['password'], password):
            session['username'] = username
            session['session_id'] = str(uuid.uuid4())
            
            # Update last login
            credentials[username]['statistics']['last_login'] = datetime.now().isoformat()
            save_credentials(credentials)
            
            # Add to active sessions
            active_sessions[username] = {
                'session_id': session['session_id'],
                'last_activity': datetime.now().isoformat(),
                'school_name': credentials[username].get('school_name', 'Unknown School'),
                'current_topic': None,
                'grade': None
            }
            
            log_user_activity(username, "Logged in successfully")
            return redirect(url_for('about'))
        else:
            flash('Invalid credentials')
            log_user_activity(username, "Failed login attempt")
    
    return render_template('login.html')

@app.route('/create_account', methods=['GET', 'POST'])
def create_account():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        school_name = request.form.get('school_name', '').strip()
        
        credentials = load_credentials()
        
        if username in credentials:
            flash('Username already exists')
        else:
            credentials[username] = {
                "password": generate_password_hash(password),
                "school_name": school_name if school_name else "Unknown School",
                "history": [],
                "statistics": {
                    "questions_attempted": 0,
                    "topics_covered": [],
                    "last_login": None
                }
            }
            save_credentials(credentials)
            
            log_user_activity(username, "Account created successfully")
            flash('Account created successfully')
            return redirect(url_for('login'))
    
    return render_template('create_account.html')

@app.route('/about')
def about():
    if 'username' not in session:
        return redirect(url_for('login'))
    
    log_user_activity(session['username'], "Visited about page")
    return render_template('about.html', logo_path=LOGO_PATH)

@app.route('/topics/<int:grade>')
def topics(grade):
    if 'username' not in session:
        return redirect(url_for('login'))
    
    log_user_activity(session['username'], f"Visited topics for grade {grade}")
    return render_template('topics.html', grade=grade)

@app.route('/exercise/<int:grade>/<topic>')
def exercise(grade, topic):
    if 'username' not in session:
        return redirect(url_for('login'))
    
    # Update user's current activity
    update_user_activity(session['username'])
    credentials = load_credentials()
    if session['username'] in active_sessions:
        active_sessions[session['username']]['current_topic'] = topic
        active_sessions[session['username']]['grade'] = grade
    else:
        # Add to active sessions
        active_sessions[session['username']] = {
            'session_id': session.get('session_id', str(uuid.uuid4())),
            'last_activity': datetime.now().isoformat(),
            'school_name': credentials[session['username']].get('school_name', 'Unknown School'),
            'current_topic': topic,
            'grade': grade
        }
    
    # Load user history for difficulty adjustment
    user_history = credentials[session['username']]['history']
    
    # Load prompt and call LLM
    prompt = load_prompt(topic)
    llm_response = call_llm_api(prompt, user_history)
    
    if 'error' in llm_response:
        flash(f'Error generating questions: {llm_response["error"]}')
        return redirect(url_for('topics', grade=grade))
    
    # Store questions in session
    session['current_questions'] = llm_response.get('questions', [])
    session['current_question_index'] = 0
    session['current_topic'] = topic
    session['current_grade'] = grade
    
    log_user_activity(session['username'], f"Started exercise for {topic} grade {grade}")
    return render_template('exercise.html', grade=grade, topic=topic)

@app.route('/get_current_question')
def get_current_question():
    if 'username' not in session or 'current_questions' not in session:
        return jsonify({'error': 'No active session'})
    
    questions = session['current_questions']
    index = session.get('current_question_index', 0)
    
    if index >= len(questions):
        return jsonify({'finished': True})
    
    return jsonify({
        'question': questions[index],
        'index': index + 1,
        'total': len(questions)
    })

@app.route('/submit_answer', methods=['POST'])
def submit_answer():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    user_answer = data.get('answer', '')
    
    questions = session['current_questions']
    index = session.get('current_question_index', 0)
    
    if index >= len(questions):
        return jsonify({'error': 'No more questions'})
    
    current_question = questions[index]
    question_text = current_question.get('question', '')
    explanation = current_question.get('explanation', '')
    
    # Use LLM to check the answer
    is_correct = check_answer_with_llm(question_text, user_answer, explanation)
    
    # Save to user history
    credentials = load_credentials()
    username = session['username']
    
    question_record = {
        'question': question_text,
        'user_answer': user_answer,
        'correct': is_correct,
        'topic': session.get('current_topic'),
        'grade': session.get('current_grade'),
        'timestamp': datetime.now().isoformat()
    }
    
    credentials[username]['history'].append(question_record)
    credentials[username]['statistics']['questions_attempted'] += 1
    
    if session.get('current_topic') not in credentials[username]['statistics']['topics_covered']:
        credentials[username]['statistics']['topics_covered'].append(session.get('current_topic'))
    
    save_credentials(credentials)
    
    # Move to next question
    session['current_question_index'] = index + 1
    
    log_user_activity(username, f"Submitted answer '{user_answer}' for question {index + 1} - {'Correct' if is_correct else 'Incorrect'}")
    
    return jsonify({
        'correct': is_correct,
        'explanation': explanation if not is_correct else '',
        'next_available': (index + 1) < len(questions)
    })

@app.route('/logout')
def logout():
    username = session.get('username', 'Unknown')
    
    # Remove from active sessions
    if username in active_sessions:
        del active_sessions[username]
    
    # End any active chat sessions
    collaboration_data = load_collaboration_data()
    for session_id, session_data in collaboration_data['chat_sessions'].items():
        if (session_data['active'] and 
            (session_data['user1'] == username or session_data['user2'] == username)):
            session_data['active'] = False
    save_collaboration_data(collaboration_data)
    
    session.clear()
    log_user_activity(username, "Logged out")
    return redirect(url_for('login'))

@app.route('/check_session')
def check_session():
    """Check if user session is valid"""
    if 'username' in session:
        return jsonify({'valid': True})
    else:
        return jsonify({'valid': False})

def check_answer_with_llm(question, user_answer, correct_explanation):
    """Use LLM to check if user's answer is correct"""
    if not LLM_ENDPOINT or not LLM_API_KEY:
        # For mock questions, do basic comparison
        # For math problems, try to extract numbers and check
        if any(word in question.lower() for word in ['stickers', 'apples', 'toys', 'books']):
            # Try to find the expected answer in the explanation
            import re
            numbers = re.findall(r'\d+', correct_explanation)
            if numbers:
                expected = numbers[-1]  # Usually the last number is the answer
                return str(user_answer).strip() == expected
        return False
    
    try:
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': f'Bearer {LLM_API_KEY}'
        }
        
        check_prompt = f"""
        Question: {question}
        Student's Answer: {user_answer}
        Correct Answer and Explanation: {correct_explanation}
        
        Is the student's answer correct? Respond with only "CORRECT" or "INCORRECT" followed by a brief explanation.
        Consider partial credit for math problems where the method is right but there might be a small calculation error.
        """
        
        payload = {
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert teacher evaluating student answers. Be fair but accurate in your assessment."
                },
                {
                    "role": "user", 
                    "content": check_prompt
                }
            ],
            "model": "deepseek-chat",
            "max_tokens": 200,
            "temperature": 0.1,  # Low temperature for consistent evaluation
            "stream": False
        }
        
        response = requests.post(LLM_ENDPOINT, headers=headers, json=payload)
        response.raise_for_status()
        
        response_data = response.json()
        content = response_data['choices'][0]['message']['content'].strip()
        
        # Check if the response indicates correct answer
        is_correct = content.upper().startswith('CORRECT')
        return is_correct
        
    except Exception as e:
        app.logger.error(f"Answer checking failed: {str(e)}")
        # Fallback to basic checking
        return str(user_answer).strip().lower() in correct_explanation.lower()

# Collaboration endpoints
@app.route('/get_active_users')
def get_active_users():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    cleanup_old_sessions()
    update_user_activity(session['username'])
    
    current_user = session['username']
    current_user_session = active_sessions.get(current_user, {})
    current_school = current_user_session.get('school_name', '')
    current_grade = current_user_session.get('grade', None)
    
    # Only show users if current user has selected a grade
    if current_grade is None:
        return jsonify({'users': []})
    
    # Get users from same school AND same grade who are currently in exercises
    active_users = []
    for username, session_data in active_sessions.items():
        if (username != current_user and 
            session_data.get('school_name') == current_school and
            session_data.get('grade') == current_grade and  # Added grade check
            session_data.get('current_topic') is not None):
            active_users.append({
                'username': username,
                'topic': session_data.get('current_topic'),
                'grade': session_data.get('grade')
            })
    
    return jsonify({'users': active_users})

@app.route('/send_collaboration_invite', methods=['POST'])
def send_collaboration_invite():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    target_user = data.get('target_user')
    from_user = session['username']
    
    if not target_user:
        return jsonify({'error': 'Target user not specified'})
    
    if target_user not in active_sessions:
        return jsonify({'error': 'Target user is not active'})
    
    # Check if users are from same school AND same grade
    from_user_session = active_sessions.get(from_user, {})
    target_user_session = active_sessions.get(target_user, {})
    
    from_school = from_user_session.get('school_name', '')
    target_school = target_user_session.get('school_name', '')
    from_grade = from_user_session.get('grade')
    target_grade = target_user_session.get('grade')
    
    if from_school != target_school:
        return jsonify({'error': 'Can only collaborate with users from same school'})
    
    if from_grade != target_grade:
        return jsonify({'error': 'Can only collaborate with users from same grade'})
    
    collaboration_data = load_collaboration_data()
    
    # Clean up old invites between these users
    to_remove = []
    for invite_id, invite in collaboration_data['invites'].items():
        if ((invite['from_user'] == from_user and invite['to_user'] == target_user) or
            (invite['from_user'] == target_user and invite['to_user'] == from_user)):
            to_remove.append(invite_id)
    
    for invite_id in to_remove:
        del collaboration_data['invites'][invite_id]
    
    # Create invite
    invite_id = str(uuid.uuid4())
    collaboration_data['invites'][invite_id] = {
        'from_user': from_user,
        'to_user': target_user,
        'timestamp': datetime.now().isoformat(),
        'status': 'pending'
    }
    
    save_collaboration_data(collaboration_data)
    
    log_user_activity(from_user, f"Sent collaboration invite to {target_user}")
    return jsonify({'success': True})

@app.route('/check_collaboration_invites')
def check_collaboration_invites():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    update_user_activity(session['username'])
    username = session['username']
    
    collaboration_data = load_collaboration_data()
    
    # Check for pending invites for this user
    for invite_id, invite in collaboration_data['invites'].items():
        if invite['to_user'] == username and invite['status'] == 'pending':
            return jsonify({'invite': invite})
    
    # Check if any of our sent invites were accepted and we have an active chat session
    for session_id, session_data in collaboration_data['chat_sessions'].items():
        if (session_data['active'] and 
            (session_data['user1'] == username or session_data['user2'] == username)):
            # Find the partner
            partner = session_data['user2'] if session_data['user1'] == username else session_data['user1']
            return jsonify({'accepted_chat': {'partner': partner}})
    
    return jsonify({'invite': None})

@app.route('/respond_collaboration_invite', methods=['POST'])
def respond_collaboration_invite():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    from_user = data.get('from_user')
    accept = data.get('accept', False)
    current_user = session['username']
    
    collaboration_data = load_collaboration_data()
    
    # Find and update the invite
    invite_found = False
    for invite_id, invite in collaboration_data['invites'].items():
        if (invite['from_user'] == from_user and 
            invite['to_user'] == current_user and 
            invite['status'] == 'pending'):
            
            invite['status'] = 'accepted' if accept else 'declined'
            invite_found = True
            
            if accept:
                # Create chat session
                chat_session_id = str(uuid.uuid4())
                collaboration_data['chat_sessions'][chat_session_id] = {
                    'user1': from_user,
                    'user2': current_user,
                    'messages': [],
                    'active': True,
                    'created_at': datetime.now().isoformat()
                }
                
                log_user_activity(current_user, f"Accepted collaboration invite from {from_user}")
            else:
                log_user_activity(current_user, f"Declined collaboration invite from {from_user}")
            
            break
    
    save_collaboration_data(collaboration_data)
    
    if not invite_found:
        return jsonify({'error': 'Invite not found'})
    
    return jsonify({'success': True})

@app.route('/send_chat_message', methods=['POST'])
def send_chat_message():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    to_user = data.get('to_user')
    message = data.get('message', '').strip()
    from_user = session['username']
    
    if not message or len(message) > 200:
        return jsonify({'error': 'Invalid message length'})
    
    collaboration_data = load_collaboration_data()
    
    # Find active chat session
    chat_session = None
    for session_id, session_data in collaboration_data['chat_sessions'].items():
        if (session_data['active'] and 
            ((session_data['user1'] == from_user and session_data['user2'] == to_user) or
             (session_data['user1'] == to_user and session_data['user2'] == from_user))):
            chat_session = session_data
            break
    
    if not chat_session:
        return jsonify({'error': 'No active chat session'})
    
    # Add message
    collaboration_data['message_counter'] = collaboration_data.get('message_counter', 0) + 1
    message_data = {
        'id': collaboration_data['message_counter'],
        'from_user': from_user,
        'to_user': to_user,
        'message': message,
        'timestamp': datetime.now().isoformat(),
        'displayed': False
    }
    
    chat_session['messages'].append(message_data)
    save_collaboration_data(collaboration_data)
    
    return jsonify({'success': True})

@app.route('/get_chat_messages')
def get_chat_messages():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    partner = request.args.get('partner')
    current_user = session['username']
    
    if not partner:
        return jsonify({'error': 'Partner not specified'})
    
    collaboration_data = load_collaboration_data()
    
    # Find active chat session
    messages = []
    for session_id, session_data in collaboration_data['chat_sessions'].items():
        if (session_data['active'] and 
            ((session_data['user1'] == current_user and session_data['user2'] == partner) or
             (session_data['user1'] == partner and session_data['user2'] == current_user))):
            
            # Get messages for current user
            for msg in session_data['messages']:
                if msg['to_user'] == current_user and not msg['displayed']:
                    messages.append(msg)
            break
    
    return jsonify({'messages': messages})

@app.route('/mark_message_displayed', methods=['POST'])
def mark_message_displayed():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    message_id = data.get('message_id')
    
    collaboration_data = load_collaboration_data()
    
    # Find and mark message as displayed
    for session_id, session_data in collaboration_data['chat_sessions'].items():
        for msg in session_data['messages']:
            if msg['id'] == message_id:
                msg['displayed'] = True
                save_collaboration_data(collaboration_data)
                return jsonify({'success': True})
    
    return jsonify({'error': 'Message not found'})

@app.route('/end_chat', methods=['POST'])
def end_chat():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    partner = data.get('partner')
    current_user = session['username']
    
    collaboration_data = load_collaboration_data()
    
    # Find and deactivate chat session
    for session_id, session_data in collaboration_data['chat_sessions'].items():
        if (session_data['active'] and 
            ((session_data['user1'] == current_user and session_data['user2'] == partner) or
             (session_data['user1'] == partner and session_data['user2'] == current_user))):
            
            session_data['active'] = False
            break
    
    save_collaboration_data(collaboration_data)
    log_user_activity(current_user, f"Ended chat session with {partner}")
    
    return jsonify({'success': True})

@app.route('/games/<int:grade>')
def games_list(grade):
    """Display available games for a specific grade"""
    if 'username' not in session:
        return redirect(url_for('login'))
    
    if grade < 1 or grade > 7:
        flash('Games are only available for grades 1-7')
        return redirect(url_for('topics', grade=1))
    
    # Simple list of available games (no database needed)
    games = [
        {
            'name': 'TejasThrust',
            'slug': 'tejas-thrust',
            'description': 'A kid-friendly fighter plane game where you pilot a blue plane and battle enemy aircraft!'
        }
    ]
    
    log_user_activity(session['username'], f"Visited games for grade {grade}")
    return render_template('games/games_list.html', games=games, grade=grade, logo_path=LOGO_PATH)

@app.route('/games/play/<string:game_slug>')
def game_detail(game_slug):
    """Display a specific game"""
    if 'username' not in session:
        return redirect(url_for('login'))
    
    if game_slug != 'tejas-thrust':
        flash('Game not found')
        return redirect(url_for('games_list', grade=1))
    
    game = {
        'name': 'TejasThrust',
        'slug': 'tejas-thrust',
        'description': 'A kid-friendly fighter plane game where you pilot a blue plane and battle enemy aircraft!'
    }
    
    log_user_activity(session['username'], f"Started playing {game_slug}")
    return render_template('games/game_detail.html', game=game, logo_path=LOGO_PATH)

if __name__ == '__main__':
    init_credentials_db()
    init_collaboration_db()

    # SSL Configuration
    context = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
    
    # Path to your certificates
    cert_path = os.path.join(os.path.dirname(__file__), 'ssl_certs', 'cert.pem')
    key_path = os.path.join(os.path.dirname(__file__), 'ssl_certs', 'key.pem')

    try:
        context.load_cert_chain(cert_path, key_path)

        #print("🔒 Starting HTTPS server...")
        #print("🌐 Access at: https://localhost:8443")
        #print("⚠️  You'll see a security warning - click 'Advanced' then 'Proceed to localhost'")

        app.run(
            host='0.0.0.0',
            port=8443,  # Using 8443 to avoid needing sudo
            debug=False,  # Set to False for HTTPS
            ssl_context=context
        )
    except FileNotFoundError as e:
        print("❌ SSL certificates not found!")
        print("📁 Expected files:")
        print(f"   - {cert_path}")
        print(f"   - {key_path}")
        print("🔧 Please ensure certificates are generated in ssl_certs folder.")
        print("\n🔄 Falling back to HTTP...")
        app.run(debug=True, host='0.0.0.0', port=5001)
    except Exception as e:
        print(f"❌ SSL Error: {e}")
        print("🔄 Falling back to HTTP...")
        app.run(debug=True, host='0.0.0.0', port=5001)