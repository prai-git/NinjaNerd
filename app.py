from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from flask_session import Session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv
import json
import os
import sys
import logging
from logging.handlers import RotatingFileHandler
import requests
import uuid
from datetime import datetime, timedelta
from werkzeug.security import generate_password_hash, check_password_hash
import ssl
import argparse
import atexit
import signal
from functools import wraps
from ai.llm_service import LLMService
from dbmgr.sqlite_app_integration import initialize_app_db, get_app_db
from dbmgr.exceptions import DatabaseException
from core.message_security import obfuscate_message, deobfuscate_message, is_message_obfuscated
from session_storage.session_expiry import (
    SESSION_TIMEOUT_MINUTES, 
    is_session_expired, 
    SessionCleanupScheduler
)
# Import concurrency and security utilities from core module
from core import (
    initialize_concurrency_manager, synchronized, thread_safe_operation,
    LOCK_ACTIVE_SESSIONS, LOCK_COLLABORATION_DATA, LOCK_MESSAGE_COUNTER, LOCK_CREDENTIALS,
    get_safe_llm_service, initialize_safe_llm_service,
    get_input_validator, sanitize_input
)

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
# Use a string secret key instead of bytes to avoid MessageObfuscator issues
app.secret_key = os.urandom(24).hex()  # Convert bytes to hex string

# Global logging configuration - will be initialized when app runs
logging_integration = None

# Initialize concurrency management and safe services
concurrency_manager = None
input_validator = None
safe_llm_service = None

def initialize_production_logging():
    """Initialize production logging system"""
    global logging_integration
    try:
        from logging_system import init_production_logging, LogConfig
        
        # Create production logging configuration
        logging_config = LogConfig(
            log_level='INFO',
            enable_async_logging=True,
            enable_performance_logging=True,
            enable_structured_logging=True,
            enable_request_logging=True,
            max_log_file_size_mb=50,
            backup_count=10,
            log_retention_days=30
        )
        
        # Initialize production logging
        logging_integration = init_production_logging(app, logging_config)
        
        app.logger.info("Production logging system initialized successfully")
        return logging_integration
        
    except Exception as e:
        # Fallback to basic logging if production logging fails
        print(f"Failed to initialize production logging, falling back to basic logging: {e}")
        
        # Basic logging setup
        if not os.path.exists('logs'):
            os.makedirs('logs')
        
        log_handler = RotatingFileHandler('logs/ninjnerd.log', maxBytes=10*1024*1024, backupCount=5)
        log_handler.setFormatter(logging.Formatter(
            '%(asctime)s %(levelname)s: %(message)s [in %(pathname)s:%(lineno)d]'
        ))
        log_handler.setLevel(logging.INFO)
        app.logger.addHandler(log_handler)
        app.logger.setLevel(logging.INFO)
        return None

# Production-ready session storage with Redis and filesystem fallback
try:
    from session_storage import init_production_sessions, create_production_session_config
    
    # Create production session configuration
    session_config = create_production_session_config()
    
    # Initialize production session storage
    production_sessions = init_production_sessions(app, session_config)
    
    app.logger.info("Production session storage initialized successfully")
    
except Exception as e:
    app.logger.warning(f"Failed to initialize production sessions, falling back to basic sessions: {e}")
    
    # Fallback to basic filesystem sessions
    app.config['SESSION_TYPE'] = 'filesystem'
    app.config['SESSION_PERMANENT'] = False
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=SESSION_TIMEOUT_MINUTES)
    Session(app)
    production_sessions = None

# Rate limiting configuration
def get_rate_limit_key():
    """Get rate limit key based on user session or IP address"""
    # For login route, always use IP address to avoid session confusion
    if request.endpoint == 'login':
        return get_remote_address()
    # For other routes, use username if available
    if 'username' in session:
        return session['username']
    return get_remote_address()

# Initialize rate limiter with graceful error handling
try:
    limiter = Limiter(
        app=app,
        key_func=get_rate_limit_key,
        default_limits=["1000 per hour"],
        storage_uri="memory://",
        headers_enabled=True,
        swallow_errors=True  # Graceful degradation if rate limiting fails
    )
except Exception as e:
    # Use print for early initialization errors before app.logger is ready
    print(f"Failed to initialize rate limiter: {e}")
    limiter = None

# Rate limit error handler
@app.errorhandler(429)
def rate_limit_handler(e):
    """Handle rate limit exceeded errors"""
    if request.is_json:
        return jsonify({
            'error': 'Rate limit exceeded',
            'message': 'Too many requests. Please slow down and try again later.',
            'retry_after': getattr(e, 'retry_after', 60)
        }), 429
    else:
        flash('Too many requests. Please slow down and try again later.')
        return render_template('error.html', 
                             error_code=429,
                             error_message='Rate limit exceeded'), 429

# Rate limiting decorator helpers
def apply_rate_limit(limit_string):
    """Apply rate limiting with graceful degradation"""
    def decorator(f):
        if limiter:
            return limiter.limit(limit_string)(f)
        return f
    return decorator

def apply_auth_rate_limit(limit_string):
    """Apply rate limiting for authenticated endpoints"""
    def decorator(f):
        if limiter:
            return limiter.limit(limit_string, key_func=lambda: session.get('username', get_remote_address()))(f)
        return f
    return decorator

def apply_login_rate_limit(limit_string):
    """Apply rate limiting specifically for login endpoint"""
    def decorator(f):
        if limiter:
            return limiter.limit(limit_string, key_func=lambda: get_remote_address())(f)
        return f
    return decorator

# Environment variables
LOGO_PATH = os.getenv('PR_NIBODH_LOGO', '/static/images/logo.png')

# Subtopic definitions
SUBTOPICS = {
    'math': {
        'grades_5_and_below': [
            {'id': 'number_sense_basic_operations', 'name': 'Number Sense & Basic Operations', 'description': 'Understanding numbers, place value, addition, subtraction, multiplication, and division', 'icon': 'fa-sort-numeric-up', 'color': 'primary'},
            {'id': 'fractions_decimals', 'name': 'Fractions & Decimals', 'description': 'Introduction to fractions, equivalent fractions, comparing fractions, decimal concepts, and simple operations with both', 'icon': 'fa-divide', 'color': 'success'},
            {'id': 'geometry_spatial_concepts', 'name': 'Geometry & Spatial Concepts', 'description': 'Basic shapes, symmetry, patterns, area, perimeter, and simple volume measurements', 'icon': 'fa-shapes', 'color': 'info'},
            {'id': 'measurement_data', 'name': 'Measurement & Data', 'description': 'Units of measurement (length, weight, capacity, time), collecting and representing data, simple graphs and charts', 'icon': 'fa-ruler', 'color': 'warning'},
            {'id': 'problem_solving_applications', 'name': 'Problem Solving & Applications', 'description': 'Multi-step word problems, mathematical reasoning, patterns, and practical applications of math concepts', 'icon': 'fa-lightbulb', 'color': 'danger'}
        ],
        'grades_above_5': [
            {'id': 'number_sense_basic_operations', 'name': 'Number Sense & Basic Operations', 'description': 'Understanding numbers, place value, addition, subtraction, multiplication, and division', 'icon': 'fa-sort-numeric-up', 'color': 'primary'},
            {'id': 'fractions_decimals', 'name': 'Fractions & Decimals', 'description': 'Introduction to fractions, equivalent fractions, comparing fractions, decimal concepts, and simple operations with both', 'icon': 'fa-divide', 'color': 'success'},
            {'id': 'geometry_spatial_concepts', 'name': 'Geometry & Spatial Concepts', 'description': 'Basic shapes, symmetry, patterns, area, perimeter, and simple volume measurements', 'icon': 'fa-shapes', 'color': 'info'},
            {'id': 'measurement_data', 'name': 'Measurement & Data', 'description': 'Units of measurement (length, weight, capacity, time), collecting and representing data, simple graphs and charts', 'icon': 'fa-ruler', 'color': 'warning'},
            {'id': 'problem_solving_applications', 'name': 'Problem Solving & Applications', 'description': 'Multi-step word problems, mathematical reasoning, patterns, and practical applications of math concepts', 'icon': 'fa-lightbulb', 'color': 'danger'},
            {'id': 'advanced_number_systems', 'name': 'Advanced Number Systems', 'description': 'Integers, rational and irrational numbers, number properties, and operations across number systems', 'icon': 'fa-infinity', 'color': 'dark'},
            {'id': 'algebraic_concepts', 'name': 'Algebraic Concepts', 'description': 'Variables, expressions, equations, inequalities, functions, and algebraic reasoning', 'icon': 'fa-calculator', 'color': 'secondary'},
            {'id': 'proportional_reasoning_percentages', 'name': 'Proportional Reasoning & Percentages', 'description': 'Ratios, rates, proportions, percent problems, and applications', 'icon': 'fa-percentage', 'color': 'primary'},
            {'id': 'advanced_geometry_measurement', 'name': 'Advanced Geometry & Measurement', 'description': 'Area, perimeter, and volume of complex 2D and 3D figures, coordinate geometry, transformations', 'icon': 'fa-cube', 'color': 'success'},
            {'id': 'data_analysis_functions', 'name': 'Data Analysis & Functions', 'description': 'Statistical concepts, graphs, data representations, function types (linear, quadratic, exponential), and mathematical modeling', 'icon': 'fa-chart-line', 'color': 'info'}
        ]
    },
    'english': {
        'grades_5_and_below': [
            {'id': 'reading_fundamentals', 'name': 'Reading Fundamentals', 'description': 'Reading comprehension, author\'s purpose and tone, text structure, story elements, poetry features, and basic literary analysis', 'icon': 'fa-book-open', 'color': 'primary'},
            {'id': 'writing_essentials', 'name': 'Writing Essentials', 'description': 'Organizing ideas, developing arguments, crafting introductions and conclusions, descriptive writing, research skills, and summarizing', 'icon': 'fa-pen', 'color': 'success'},
            {'id': 'vocabulary_building', 'name': 'Vocabulary Building', 'description': 'Prefixes and suffixes, synonyms and antonyms, analogies, idioms and adages, Greek and Latin roots, homophones and homonyms', 'icon': 'fa-spell-check', 'color': 'info'},
            {'id': 'grammar_language_mechanics', 'name': 'Grammar & Language Mechanics', 'description': 'Parts of speech (nouns, verbs, pronouns, adjectives, adverbs), subject-verb agreement, contractions, prepositions, and sentence structure', 'icon': 'fa-language', 'color': 'warning'},
            {'id': 'written_conventions', 'name': 'Written Conventions', 'description': 'Spelling, capitalization, formatting, abbreviations, basic punctuation, and editing skills', 'icon': 'fa-edit', 'color': 'danger'}
        ],
        'grades_above_5': [
            {'id': 'reading_fundamentals', 'name': 'Reading Fundamentals', 'description': 'Reading comprehension, author\'s purpose and tone, text structure, story elements, poetry features, and basic literary analysis', 'icon': 'fa-book-open', 'color': 'primary'},
            {'id': 'writing_essentials', 'name': 'Writing Essentials', 'description': 'Organizing ideas, developing arguments, crafting introductions and conclusions, descriptive writing, research skills, and summarizing', 'icon': 'fa-pen', 'color': 'success'},
            {'id': 'vocabulary_building', 'name': 'Vocabulary Building', 'description': 'Prefixes and suffixes, synonyms and antonyms, analogies, idioms and adages, Greek and Latin roots, homophones and homonyms', 'icon': 'fa-spell-check', 'color': 'info'},
            {'id': 'grammar_language_mechanics', 'name': 'Grammar & Language Mechanics', 'description': 'Parts of speech (nouns, verbs, pronouns, adjectives, adverbs), subject-verb agreement, contractions, prepositions, and sentence structure', 'icon': 'fa-language', 'color': 'warning'},
            {'id': 'written_conventions', 'name': 'Written Conventions', 'description': 'Spelling, capitalization, formatting, abbreviations, basic punctuation, and editing skills', 'icon': 'fa-edit', 'color': 'danger'},
            {'id': 'literary_analysis_comprehension', 'name': 'Literary Analysis & Comprehension', 'description': 'Analyzing literature, novel studies, nonfiction book studies, thematic development, and critical reading strategies', 'icon': 'fa-search', 'color': 'dark'},
            {'id': 'advanced_writing_styles', 'name': 'Advanced Writing Styles', 'description': 'Expository writing, persuasive and opinion writing, creative writing, research papers, and rhetorical techniques', 'icon': 'fa-feather-alt', 'color': 'secondary'},
            {'id': 'sentence_craft_structure', 'name': 'Sentence Craft & Structure', 'description': 'Sentences vs. fragments and run-ons, phrases and clauses, direct and indirect objects, active and passive voice, and complex sentences', 'icon': 'fa-link', 'color': 'primary'},
            {'id': 'advanced_grammar_applications', 'name': 'Advanced Grammar Applications', 'description': 'Conjunctions, misplaced modifiers, complex verb tenses, advanced agreement rules, and grammatical analysis', 'icon': 'fa-cogs', 'color': 'success'},
            {'id': 'advanced_punctuation_style', 'name': 'Advanced Punctuation & Style', 'description': 'Commas, semicolons, dashes, hyphens, ellipses, citation formats, style variations, and editing for publication', 'icon': 'fa-quote-right', 'color': 'info'}
        ]
    },
    'science': {
        'grades_5_and_below': [
            {'id': 'physical_science_basics', 'name': 'Physical Science Basics', 'description': 'Materials, matter and mass, physical and chemical changes, atoms and molecules, heat and thermal energy', 'icon': 'fa-atom', 'color': 'primary'},
            {'id': 'forces_energy', 'name': 'Forces & Energy', 'description': 'Force and motion, magnetism, electricity, light, simple machines, and energy basics', 'icon': 'fa-bolt', 'color': 'success'},
            {'id': 'earth_systems', 'name': 'Earth Systems', 'description': 'Rocks, fossils, weather and climate, Earth\'s features, natural resources, and water cycle', 'icon': 'fa-globe', 'color': 'info'},
            {'id': 'life_science_fundamentals', 'name': 'Life Science Fundamentals', 'description': 'Animals, plants, adaptations, traits and heredity, ecosystems, and basic classification', 'icon': 'fa-leaf', 'color': 'warning'},
            {'id': 'scientific_investigation_skills', 'name': 'Scientific Investigation Skills', 'description': 'Units and measurement, scientific names, observation methods, basic astronomy, and simple experimentation', 'icon': 'fa-microscope', 'color': 'danger'}
        ],
        'grades_above_5': [
            {'id': 'physical_science_basics', 'name': 'Physical Science Basics', 'description': 'Materials, matter and mass, physical and chemical changes, atoms and molecules, heat and thermal energy', 'icon': 'fa-atom', 'color': 'primary'},
            {'id': 'forces_energy', 'name': 'Forces & Energy', 'description': 'Force and motion, magnetism, electricity, light, simple machines, and energy basics', 'icon': 'fa-bolt', 'color': 'success'},
            {'id': 'earth_systems', 'name': 'Earth Systems', 'description': 'Rocks, fossils, weather and climate, Earth\'s features, natural resources, and water cycle', 'icon': 'fa-globe', 'color': 'info'},
            {'id': 'life_science_fundamentals', 'name': 'Life Science Fundamentals', 'description': 'Animals, plants, adaptations, traits and heredity, ecosystems, and basic classification', 'icon': 'fa-leaf', 'color': 'warning'},
            {'id': 'scientific_investigation_skills', 'name': 'Scientific Investigation Skills', 'description': 'Units and measurement, scientific names, observation methods, basic astronomy, and simple experimentation', 'icon': 'fa-microscope', 'color': 'danger'},
            {'id': 'scientific_methods_research', 'name': 'Scientific Methods & Research', 'description': 'Science practices and tools, designing experiments, data analysis, scientific reasoning, and technology applications', 'icon': 'fa-flask', 'color': 'dark'},
            {'id': 'advanced_biology', 'name': 'Advanced Biology', 'description': 'Anatomy and physiology, cellular biology, genetics, evolution, biodiversity, and complex ecosystems', 'icon': 'fa-dna', 'color': 'secondary'},
            {'id': 'chemistry_concepts', 'name': 'Chemistry Concepts', 'description': 'Biochemistry, atomic structure, chemical reactions, periodic table, solutions, and chemical equations', 'icon': 'fa-vial', 'color': 'primary'},
            {'id': 'physics_energy_systems', 'name': 'Physics & Energy Systems', 'description': 'Kinetic and potential energy, waves, electricity and magnetism, motion and forces, and thermodynamics', 'icon': 'fa-wave-square', 'color': 'success'},
            {'id': 'earth_space_science', 'name': 'Earth & Space Science', 'description': 'Geology, astronomy, climate systems, environmental science, natural resources, and sustainability', 'icon': 'fa-satellite', 'color': 'info'}
        ]
    },
    'geography': {
        'grades_5_and_below': [
            {'id': 'map_skills_geography_fundamentals', 'name': 'Map Skills & Geography Fundamentals', 'description': 'Basic map reading, cardinal directions, map legends, globes, and geographic terminology', 'icon': 'fa-map', 'color': 'primary'},
            {'id': 'physical_geography_basics', 'name': 'Physical Geography Basics', 'description': 'Landforms, bodies of water, weather patterns, seasons, and basic ecosystems', 'icon': 'fa-mountain', 'color': 'success'},
            {'id': 'us_regions_landscapes', 'name': 'U.S. Regions & Landscapes', 'description': 'Major geographic regions of the United States, distinctive features, and natural resources', 'icon': 'fa-flag-usa', 'color': 'info'},
            {'id': 'us_states_capitals', 'name': 'U.S. States & Capitals', 'description': 'Location and identification of states, capitals, major landmarks, and regional characteristics', 'icon': 'fa-city', 'color': 'warning'},
            {'id': 'communities_places_america', 'name': 'Communities & Places in America', 'description': 'Major cities, local geography, urban/rural differences, and community features', 'icon': 'fa-home', 'color': 'danger'}
        ],
        'grades_above_5': [
            {'id': 'map_skills_geography_fundamentals', 'name': 'Map Skills & Geography Fundamentals', 'description': 'Basic map reading, cardinal directions, map legends, globes, and geographic terminology', 'icon': 'fa-map', 'color': 'primary'},
            {'id': 'physical_geography_basics', 'name': 'Physical Geography Basics', 'description': 'Landforms, bodies of water, weather patterns, seasons, and basic ecosystems', 'icon': 'fa-mountain', 'color': 'success'},
            {'id': 'us_regions_landscapes', 'name': 'U.S. Regions & Landscapes', 'description': 'Major geographic regions of the United States, distinctive features, and natural resources', 'icon': 'fa-flag-usa', 'color': 'info'},
            {'id': 'us_states_capitals', 'name': 'U.S. States & Capitals', 'description': 'Location and identification of states, capitals, major landmarks, and regional characteristics', 'icon': 'fa-city', 'color': 'warning'},
            {'id': 'communities_places_america', 'name': 'Communities & Places in America', 'description': 'Major cities, local geography, urban/rural differences, and community features', 'icon': 'fa-home', 'color': 'danger'},
            {'id': 'north_south_american_geography', 'name': 'North & South American Geography', 'description': 'Physical features, countries, cultures, economic systems, and historical geography of the Americas', 'icon': 'fa-globe-americas', 'color': 'dark'},
            {'id': 'european_geography_societies', 'name': 'European Geography & Societies', 'description': 'European nations, physical features, cultural regions, historical development, and political geography', 'icon': 'fa-globe-europe', 'color': 'secondary'},
            {'id': 'african_landscapes_cultures', 'name': 'African Landscapes & Cultures', 'description': 'African regions, physical geography, resources, cultural diversity, and environmental challenges', 'icon': 'fa-globe-africa', 'color': 'primary'},
            {'id': 'asia_middle_east_environments_societies', 'name': 'Asia & Middle East: Environments & Societies', 'description': 'Asian geography, cultural systems, environmental relationships, population patterns, and geopolitical issues', 'icon': 'fa-globe-asia', 'color': 'success'},
            {'id': 'oceania_global_geographic_systems', 'name': 'Oceania & Global Geographic Systems', 'description': 'Australia, New Zealand, Pacific Islands, global climate patterns, human-environment interaction, and sustainability', 'icon': 'fa-water', 'color': 'info'}
        ]
    },
    'history': {
        'grades_5_and_below': [
            {'id': 'early_american_settlements', 'name': 'Early American Settlements', 'description': 'The thirteen colonies, early English colonies in North America, colonial life, and indigenous peoples', 'icon': 'fa-ship', 'color': 'primary'},
            {'id': 'american_revolution_independence', 'name': 'American Revolution & Independence', 'description': 'Causes of the American Revolution, key figures, important events, and the formation of a new nation', 'icon': 'fa-flag', 'color': 'success'},
            {'id': '19th_century_america', 'name': '19th Century America', 'description': 'Early 19th century American history, westward expansion, pioneers, and development of the young nation', 'icon': 'fa-horse', 'color': 'info'},
            {'id': 'modern_american_challenges', 'name': 'Modern American Challenges', 'description': 'The Great Depression, World War II, changes in American society, and basic civic understanding', 'icon': 'fa-balance-scale', 'color': 'warning'},
            {'id': 'historical_thinking_economics', 'name': 'Historical Thinking & Economics', 'description': 'Chronology and causation, basic economic principles, historical evidence, and how people lived in the past', 'icon': 'fa-clock', 'color': 'danger'}
        ],
        'grades_above_5': [
            {'id': 'early_american_settlements', 'name': 'Early American Settlements', 'description': 'The thirteen colonies, early English colonies in North America, colonial life, and indigenous peoples', 'icon': 'fa-ship', 'color': 'primary'},
            {'id': 'american_revolution_independence', 'name': 'American Revolution & Independence', 'description': 'Causes of the American Revolution, key figures, important events, and the formation of a new nation', 'icon': 'fa-flag', 'color': 'success'},
            {'id': '19th_century_america', 'name': '19th Century America', 'description': 'Early 19th century American history, westward expansion, pioneers, and development of the young nation', 'icon': 'fa-horse', 'color': 'info'},
            {'id': 'modern_american_challenges', 'name': 'Modern American Challenges', 'description': 'The Great Depression, World War II, changes in American society, and basic civic understanding', 'icon': 'fa-balance-scale', 'color': 'warning'},
            {'id': 'historical_thinking_economics', 'name': 'Historical Thinking & Economics', 'description': 'Chronology and causation, basic economic principles, historical evidence, and how people lived in the past', 'icon': 'fa-clock', 'color': 'danger'},
            {'id': 'american_government_civics', 'name': 'American Government & Civics', 'description': 'The Constitution, branches of government, the legal system, citizenship, rights, and responsibilities', 'icon': 'fa-university', 'color': 'dark'},
            {'id': 'economic_systems_financial_literacy', 'name': 'Economic Systems & Financial Literacy', 'description': 'Economic principles, financial systems, personal finance, markets, and economic decision-making', 'icon': 'fa-dollar-sign', 'color': 'secondary'},
            {'id': 'colonial_america_early_republic', 'name': 'Colonial America to Early Republic', 'description': 'Colonial America, American Revolution (deeper analysis), Constitutional era, and early national period', 'icon': 'fa-scroll', 'color': 'primary'},
            {'id': '19th_century_america_civil_war', 'name': '19th Century America & Civil War', 'description': 'The Jacksonian period, antebellum America, slavery, Civil War causes and consequences, Reconstruction', 'icon': 'fa-monument', 'color': 'success'},
            {'id': 'global_conflicts_modern_era', 'name': 'Global Conflicts & Modern Era', 'description': 'World War I, World War II (advanced analysis), international relations, Early modern Europe, and global connections', 'icon': 'fa-globe', 'color': 'info'}
        ]
    }
}



# Global variable to store LLM model choice
LLM_MODEL_TYPE = 'deepseek'  # Default to deepseek

# Initialize LLM service after app setup (will be properly initialized after argument parsing)
llm_service = None
# Initialize safe LLM service facade - will work even if real service not initialized
safe_llm_service = get_safe_llm_service()

# Database file paths
# Legacy JSON file paths (now using SQLite database)
# CREDENTIALS_FILE = 'data/Credentials.json'  # DEPRECATED - now in SQLite
# COLLABORATION_FILE = 'data/Collaboration.json'  # DEPRECATED - now in SQLite

# Global storage for active sessions (collaboration data now uses SQLite)
active_sessions = {}  # {username: {session_id, last_activity, school_name, current_topic, grade}}
# Legacy: collaboration_invites and chat_sessions now stored in SQLite database
# collaboration_invites = {}  # DEPRECATED - now in SQLite
# chat_sessions = {}  # DEPRECATED - now in SQLite

# Set active sessions reference for LLM service (will be set after service initialization)
# llm_service.set_active_sessions_reference(active_sessions)

def init_credentials_db():
    """Initialize credentials database with default admin user"""
    try:
        db = get_app_db()
        # Verify admin user exists (created by SQLite manager during initialization)
        admin_user = db.get_user("admin@gmail.com")
        if admin_user is not None:
            app.logger.info("Admin user verified in database")
        else:
            app.logger.warning("Admin user not found in database")
    except Exception as e:
        app.logger.error(f"Error initializing credentials: {e}")
        # SQLite database is required - no fallback to JSON files
        raise DatabaseException(f"SQLite database initialization failed: {e}")

def init_collaboration_db():
    """Initialize collaboration database"""
    try:
        db = get_app_db()
        # SQLite database schema is already initialized by sqlite_manager
        # Just verify connection is working
        db.sqlite_manager.get_database_stats()
        app.logger.info("Collaboration database initialized successfully")
    except Exception as e:
        app.logger.error(f"Error initializing collaboration: {e}")
        # SQLite database is required - no fallback to JSON files
        raise DatabaseException(f"SQLite collaboration initialization failed: {e}")

def load_credentials():
    """Load credentials from database with thread safety"""
    with synchronized(LOCK_CREDENTIALS):
        try:
            db = get_app_db()
            return db.load_credentials()
        except Exception as e:
            app.logger.error(f"Error loading credentials via SQLite DBManager: {e}")
            # SQLite database is required - no fallback to JSON files
            raise DatabaseException(f"Failed to load credentials from SQLite database: {e}")

def save_credentials(data):
    """Save credentials to database with thread safety"""
    with synchronized(LOCK_CREDENTIALS):
        try:
            db = get_app_db()
            db.save_credentials(data)
        except Exception as e:
            app.logger.error(f"Error saving credentials via SQLite DBManager: {e}")
            # SQLite database is required - no fallback to JSON files
            raise DatabaseException(f"Failed to save credentials to SQLite database: {e}")

def get_user(username):
    """Get user data using SQLite database manager"""
    try:
        db = get_app_db()
        return db.get_user(username)
    except Exception as e:
        app.logger.error(f"Error getting user {username}: {e}")
        # SQLite database is required - no fallback to JSON files
        raise DatabaseException(f"Failed to get user from SQLite database: {e}")

def create_user(username, user_data):
    """Create user using SQLite database manager"""
    try:
        db = get_app_db()
        # Extract individual parameters from user_data
        password = user_data.get('password', '')
        school_name = user_data.get('school_name', '')
        return db.create_user(username, password, school_name)
    except Exception as e:
        app.logger.error(f"Error creating user {username}: {e}")
        # SQLite database is required - no fallback to JSON files
        raise DatabaseException(f"Failed to create user in SQLite database: {e}")

def authenticate_user(username, password):
    """Authenticate user using SQLite database manager"""
    try:
        db = get_app_db()
        return db.authenticate_user(username, password)
    except Exception as e:
        app.logger.error(f"Error authenticating user {username}: {e}")
        # SQLite database is required - no fallback to JSON files
        raise DatabaseException(f"Failed to authenticate user with SQLite database: {e}")

def update_user_history(username, history_entry):
    """Update user history using SQLite database manager"""
    try:
        db = get_app_db()
        return db.update_user_history(username, history_entry)
    except Exception as e:
        app.logger.error(f"Error updating history for user {username}: {e}")
        # SQLite database is required - no fallback to JSON files
        raise DatabaseException(f"Failed to update user history in SQLite database: {e}")

def load_collaboration_data():
    """DEPRECATED: Load collaboration data from database with thread safety"""
    # This function is deprecated - use direct SQLite operations instead
    app.logger.warning("load_collaboration_data() is deprecated - use direct SQLite operations")
    with synchronized(LOCK_COLLABORATION_DATA):
        try:
            db = get_app_db()
            return db.load_collaboration_data()
        except Exception as e:
            app.logger.error(f"Error loading collaboration data via SQLite DBManager: {e}")
            # SQLite database is required - no fallback to JSON files
            raise DatabaseException(f"Failed to load collaboration data from SQLite database: {e}")

def save_collaboration_data(data):
    """DEPRECATED: Save collaboration data to database with thread safety"""
    # This function is deprecated - use direct SQLite operations instead
    app.logger.warning("save_collaboration_data() is deprecated - use direct SQLite operations")
    with synchronized(LOCK_COLLABORATION_DATA):
        try:
            db = get_app_db()
            db.save_collaboration_data(data)
        except Exception as e:
            app.logger.error(f"Error saving collaboration data via SQLite DBManager: {e}")
            # SQLite database is required - no fallback to JSON files
            raise DatabaseException(f"Failed to save collaboration data to SQLite database: {e}")

def end_all_user_chats(username):
    """End all active chat sessions for a user when they change grades"""
    try:
        db = get_app_db()
        success = db.end_all_user_chats(username)
        if success:
            app.logger.info(f"Ended all chat sessions for user {username}")
        else:
            app.logger.warning(f"No active chat sessions found for user {username}")
    except Exception as e:
        app.logger.error(f"Failed to end chat sessions for user {username}: {e}")

def cleanup_old_sessions():
    """Remove inactive sessions using centralized expiry logic with thread safety"""
    with synchronized(LOCK_ACTIVE_SESSIONS):
        to_remove = []
        
        for username, session_data in active_sessions.items():
            if is_session_expired(session_data):
                to_remove.append(username)
        
        cleaned_count = len(to_remove)
        for username in to_remove:
            del active_sessions[username]
        
        if cleaned_count > 0:
            app.logger.info(f"Cleaned up {cleaned_count} expired sessions")
        
        return cleaned_count

def update_user_activity(username):
    """Update user's last activity timestamp with thread safety"""
    with synchronized(LOCK_ACTIVE_SESSIONS):
        if username in active_sessions:
            active_sessions[username]['last_activity'] = datetime.now().isoformat()

def log_user_activity(username, activity):
    """Log user activity with timestamp"""
    app.logger.info(f"User: {username} | Activity: {activity}")

def enforce_grade_change_rules(username: str, new_grade: int, topic: str = None) -> bool:
    """
    Centralized grade change handling to detect grade changes and end chats if necessary.
    Thread-safe implementation with proper locking.
    
    Args:
        username: Username
        new_grade: New grade being set
        topic: Optional topic being accessed
        
    Returns:
        True if grade change was detected and handled, False if no change
    """
    with synchronized(LOCK_ACTIVE_SESSIONS):
        old_grade = None
        if username in active_sessions:
            old_grade = active_sessions[username].get('grade')
        
        # Detect grade change
        grade_changed = old_grade is not None and old_grade != new_grade
        
        if grade_changed:
            # End all active chats when grade changes
            end_all_user_chats(username)
            app.logger.info(f"User {username} changed grade from {old_grade} to {new_grade}, ended all chats")
        
        # Update session state
        user_data = get_user(username)
        
        if username in active_sessions:
            active_sessions[username]['grade'] = new_grade
            if topic:
                active_sessions[username]['current_topic'] = topic
            active_sessions[username]['last_activity'] = datetime.now().isoformat()
        else:
            # Create new session entry
            active_sessions[username] = {
                'session_id': session.get('session_id', str(uuid.uuid4())),
                'last_activity': datetime.now().isoformat(),
                'school_name': user_data.get('school_name', 'Unknown School') if user_data else 'Unknown School',
                'current_topic': topic,
                'grade': new_grade
            }
        
        return grade_changed

def load_prompt(topic):
    """Load prompt from topic file"""
    try:
        prompt_file = f"data/{topic.lower()}.txt"
        with open(prompt_file, 'r') as f:
            return f.read().strip()
    except FileNotFoundError:
        return f"Generate educational questions for {topic}"

def validate_session():
    """
    Validate user session for security and timeout.
    Returns tuple (is_valid: bool, message: str)
    """
    if 'username' not in session:
        return False, "No active session found"
    
    username = session['username']
    session_id = session.get('session_id')
    
    # Check if user exists in active sessions
    if username not in active_sessions:
        return False, "Session not found in active sessions"
    
    # Check if session ID matches
    if session_id != active_sessions[username].get('session_id'):
        return False, "Session ID mismatch"
    
    # Use centralized session expiry logic
    session_data = {
        'login_time': session.get('login_time'),
        'last_activity': active_sessions[username].get('last_activity')
    }
    
    if is_session_expired(session_data):
        return False, "Session has expired"
    
    return True, "Session is valid"

def require_login(f):
    """
    Decorator to require user authentication for protected routes.
    Validates session and redirects to login if invalid.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        is_valid, message = validate_session()
        
        if not is_valid:
            # Clear invalid session data
            username = session.get('username', 'Unknown')
            if username in active_sessions:
                del active_sessions[username]
            session.clear()
            
            flash(f"Please log in to access this page. {message}")
            log_user_activity(username, f"Access denied - {message}")
            return redirect(url_for('login'))
        
        # Update user activity timestamp
        username = session['username']
        update_user_activity(username)
        
        return f(*args, **kwargs)
    return decorated_function

def is_admin_user(username):
    """Check if the given username is an admin user"""
    return username == 'admin@gmail.com'

def require_admin(f):
    """
    Decorator to require admin authentication for protected admin routes.
    Validates session and checks if user is admin.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # First check if user is logged in
        is_valid, message = validate_session()
        
        if not is_valid:
            username = session.get('username', 'Unknown')
            if username in active_sessions:
                del active_sessions[username]
            session.clear()
            flash(f"Please log in to access this page. {message}")
            log_user_activity(username, f"Access denied - {message}")
            return redirect(url_for('login'))
        
        # Check if user is admin
        username = session['username']
        if not is_admin_user(username):
            log_user_activity(username, "Attempted to access admin-only feature")
            flash("Access denied. Admin privileges required.")
            return redirect(url_for('about'))
        
        # Update user activity timestamp
        update_user_activity(username)
        
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def index():
    return redirect(url_for('login'))

@app.route('/favicon.ico')
def favicon():
    return app.send_static_file('favicon.ico')

@app.route('/login', methods=['GET', 'POST'])
@apply_login_rate_limit("10 per 5 minutes")  # Isolated login rate limiting
def login():
    if request.method == 'POST':
        # Sanitize input fields
        validator = get_input_validator(app.logger)
        try:
            username = validator.sanitize_username(request.form['username'])
            password = request.form['password']  # Don't sanitize password, just validate it exists
        except ValueError as e:
            flash(f"Invalid input: {str(e)}")
            return render_template('login.html')
        
        # Authenticate user using database
        user_data = authenticate_user(username, password)
        if user_data:
            # Enable permanent session with configurable timeout
            session.permanent = True
            session['username'] = username
            session['session_id'] = str(uuid.uuid4())
            session['login_time'] = datetime.now().isoformat()
            
            # Update last login using centralized approach
            db = get_app_db()
            login_stats_update = {
                'last_login': datetime.now().isoformat()
            }
            db.update_user_statistics(username, login_stats_update)
            
            # Add to active sessions
            active_sessions[username] = {
                'session_id': session['session_id'],
                'last_activity': datetime.now().isoformat(),
                'school_name': user_data.get('school_name', 'Unknown School'),
                'current_topic': None,
                'grade': None
            }
            
            log_user_activity(username, "Logged in successfully")
            
            # Log security event for successful login
            try:
                from logging_system import log_audit_event, log_security_event
                log_audit_event('login', 'user_session', username, 'success')
                log_security_event('authentication', f'Successful login for user {username}', 'info')
            except Exception:
                pass  # Don't break login if logging fails
            
            return redirect(url_for('about'))
        else:
            flash('Invalid credentials')
            log_user_activity(username, "Failed login attempt")
            
            # Log security event for failed login
            try:
                from logging_system import log_audit_event, log_security_event
                log_audit_event('login', 'user_session', username, 'failed')
                log_security_event('authentication', f'Failed login attempt for user {username}', 'medium')
            except Exception:
                pass  # Don't break login if logging fails
    
    return render_template('login.html')

@app.route('/create_account', methods=['GET', 'POST'])
@apply_rate_limit("3 per 10 minutes")  # Prevent account creation spam
def create_account():
    if request.method == 'POST':
        # Sanitize input fields
        validator = get_input_validator(app.logger)
        try:
            username = validator.sanitize_username(request.form['username'])
            password = request.form['password']  # Don't sanitize password
            school_name = validator.sanitize_school_name(request.form.get('school_name', ''))
        except ValueError as e:
            flash(f"Invalid input: {str(e)}")
            return render_template('create_account.html')
        db = get_app_db()
        user = db.get_user(username)
        if user is not None:
            flash('Username already exists')
        else:
            from gw.emailgw import EmailHandler
            # Create user using the integration layer
            user_id = db.create_user(username, password, school_name if school_name else "Unknown School")
            
            if user_id:
                log_user_activity(username, "Account created successfully")
                # Send welcome email asynchronously
                try:
                    email_handler = EmailHandler()
                    email_handler.send_account_creation_async(username, username)
                    app.logger.info(f"Account creation email queued for {username}")
                except Exception as e:
                    app.logger.warning(f"Failed to queue account creation email: {e}")
                flash('Account created successfully')
                return redirect(url_for('login'))
            else:
                flash('Error creating account. Please try again.')
                return render_template('create_account.html')
    return render_template('create_account.html')

@app.route('/about')
@require_login
def about():
    username = session['username']
    log_user_activity(username, "Visited about page")
    return render_template('about.html', logo_path=LOGO_PATH, username=username, is_admin=is_admin_user(username))

@app.route('/account', methods=['GET', 'POST'])
@require_login
@apply_rate_limit("20 per minute")
def account():
    username = session['username']
    
    if request.method == 'POST':
        try:
            db = get_app_db()
            user_data = db.get_user(username)
            
            if not user_data:
                flash('User not found')
                return redirect(url_for('account'))
            
            updated = False
            # Sanitize inputs
            validator = get_input_validator(app.logger)
            
            new_password = request.form.get('password')
            raw_school_name = request.form.get('school_name')
            
            # Sanitize school name if provided
            new_school_name = None
            if raw_school_name:
                try:
                    new_school_name = validator.sanitize_school_name(raw_school_name)
                except ValueError as e:
                    flash(f"Invalid school name: {str(e)}")
                    return redirect(url_for('account'))
            
            # Update password if provided and not the masked placeholder value
            if new_password and new_password.strip() and new_password != '*****':
                # Validate password length and complexity
                if len(new_password) < 6:
                    flash("Password must be at least 6 characters long")
                    return redirect(url_for('account'))
                hashed_password = generate_password_hash(new_password)
                db.update_user_password(username, hashed_password)
                updated = True
            
            # Update school name if changed
            if new_school_name and new_school_name != user_data.get('school_name'):
                db.update_user_school(username, new_school_name)
                updated = True
            
            if updated:
                # Send email notification asynchronously
                try:
                    from gw.emailgw import EmailHandler
                    email_handler = EmailHandler()
                    subject = "Account Updated - NinjaNerd"
                    body = f"Hello {username},\n\nYour account information has been successfully updated.\n\nBest Regards,\nNinjaNerd Team"
                    email_handler.send_email_async(username, subject, body)
                    app.logger.info(f"Account update email queued for {username}")
                except Exception as e:
                    app.logger.error(f"Failed to queue account update email: {e}")
                
                flash('Credentials successfully updated')
                log_user_activity(username, "Updated account information")
            
            return redirect(url_for('account'))
            
        except Exception as e:
            app.logger.error(f"Error updating account for {username}: {e}")
            flash('Error updating account information')
            return redirect(url_for('account'))
    
    # GET request
    try:
        db = get_app_db()
        user_data = db.get_user(username)
        
        if not user_data:
            flash('User not found')
            return redirect(url_for('about'))
        
        log_user_activity(username, "Visited account page")
        return render_template('account.html', 
                             username=username,
                             school_name=user_data.get('school_name', ''))
                             
    except Exception as e:
        app.logger.error(f"Error loading account page for {username}: {e}")
        flash('Error loading account information')
        return redirect(url_for('about'))

@app.route('/statistics')
@require_login
@apply_rate_limit("10 per minute")
def statistics():
    username = session['username']
    
    try:
        db = get_app_db()
        user_data = db.get_user(username)
        
        if not user_data:
            flash('User not found')
            return redirect(url_for('about'))
        
        # Get user's history
        history = user_data.get('history', [])
        
        # Find the grade with most math questions
        grade_math_counts = {}
        for entry in history:
            if entry.get('topic') == 'math':
                grade = entry.get('grade')
                if grade:
                    grade_math_counts[grade] = grade_math_counts.get(grade, 0) + 1
        
        if not grade_math_counts:
            # No math questions answered, use grade 1 as default
            selected_grade = 1
        else:
            selected_grade = max(grade_math_counts, key=grade_math_counts.get)
        
        # Calculate statistics for the selected grade
        topics = ['math', 'english', 'science', 'history', 'geography']
        statistics = {}
        
        for topic in topics:
            topic_questions = [entry for entry in history 
                             if entry.get('topic') == topic and entry.get('grade') == selected_grade]
            
            if topic_questions:
                correct_count = sum(1 for entry in topic_questions if entry.get('correct'))
                total_count = len(topic_questions)
                percentage = (correct_count / total_count) * 100
                statistics[topic] = percentage
            else:
                statistics[topic] = 0
        
        log_user_activity(username, f"Viewed statistics for grade {selected_grade}")
        return render_template('statistics.html', 
                             statistics=statistics, 
                             grade=selected_grade)
                             
    except Exception as e:
        app.logger.error(f"Error loading statistics for {username}: {e}")
        flash('Error loading statistics')
        return redirect(url_for('about'))

@app.route('/contact_us', methods=['GET', 'POST'])
@require_login
@apply_rate_limit("5 per minute")
def contact_us():
    username = session['username']
    
    if request.method == 'POST':
        try:
            # Sanitize form inputs
            validator = get_input_validator(app.logger)
            subject = validator.sanitize_subject(request.form.get('subject', ''))
            content = validator.sanitize_content(request.form.get('content', ''))
            
            if not subject or not content:
                flash('Please fill in all fields')
                return redirect(url_for('contact_us'))
            
            if len(content) > 300:
                flash('Message content must be 300 characters or less')
                return redirect(url_for('contact_us'))
            
            # Send email to ninjanerdonpi@gmail.com asynchronously
            try:
                from gw.emailgw import EmailHandler
                email_handler = EmailHandler()
                email_subject = f"Contact Us - {subject}"
                email_body = f"From: {username}\n\nSubject: {subject}\n\nMessage:\n{content}"
                
                email_handler.send_email_async("ninjanerdonpi@gmail.com", email_subject, email_body)
                flash('Message sent successfully!')
                log_user_activity(username, f"Sent contact message: {subject}")
                app.logger.info(f"Contact us email queued from {username}")
                    
            except Exception as e:
                app.logger.error(f"Failed to queue contact email from {username}: {e}")
                flash('Failed to send message. Please try again.')
            
            return redirect(url_for('contact_us'))
            
        except Exception as e:
            app.logger.error(f"Error processing contact form from {username}: {e}")
            flash('Error processing your message')
            return redirect(url_for('contact_us'))
    
    # GET request
    log_user_activity(username, "Visited contact us page")
    return render_template('contact_us.html')

@app.route('/audit', methods=['GET', 'POST'])
@require_admin
@apply_rate_limit("10 per minute")
def audit():
    """Admin audit page to view user login and payment history"""
    admin_username = session['username']
    
    if request.method == 'POST':
        try:
            # Sanitize target username input
            validator = get_input_validator(app.logger)
            try:
                target_username = validator.sanitize_username(request.form.get('username', ''))
            except ValueError as e:
                flash(f"Invalid username: {str(e)}")
                return render_template('audit.html'), 400
            
            if not target_username:
                flash('Please enter a username')
                return redirect(url_for('audit'))
            
            # Get user data from database with proper session tracking
            db = get_app_db()
            session_id = session.get('session_id')
            user_data = db.get_user(target_username)
            
            if not user_data:
                flash(f'User "{target_username}" not found')
                log_user_activity(admin_username, f"Audit attempt for non-existent user: {target_username}")
                return redirect(url_for('audit'))
            
            # Extract audit information
            audit_data = {
                'username': target_username,
                'school_name': user_data.get('school_name', 'Not specified'),
                'history': user_data.get('history', []),
                'statistics': user_data.get('statistics', {}),
                'last_login': user_data.get('statistics', {}).get('last_login', 'Never'),
                'questions_attempted': user_data.get('statistics', {}).get('questions_attempted', 0),
                'topics_covered': user_data.get('statistics', {}).get('topics_covered', []),
                'payment_history': [],  # Payment feature not implemented yet
                'payment_amount': 0.0,  # Payment feature not implemented yet
                'payment_receipt_link': None  # Payment feature not implemented yet
            }
            
            # Count login events from history (if any contain login activities)
            login_events = []
            for entry in audit_data['history']:
                if 'timestamp' in entry:
                    login_events.append({
                        'timestamp': entry['timestamp'],
                        'activity': entry.get('topic', 'activity'),
                        'details': f"Grade {entry.get('grade', 'unknown')} - {entry.get('topic', 'unknown')}"
                    })
            
            audit_data['login_history'] = sorted(login_events, key=lambda x: x['timestamp'], reverse=True)
            
            log_user_activity(admin_username, f"Performed audit on user: {target_username}")
            
            return render_template('audit.html', audit_data=audit_data)
            
        except Exception as e:
            app.logger.error(f"Error processing audit request by {admin_username}: {e}")
            flash('Error processing audit request')
            return redirect(url_for('audit'))
    
    # GET request
    log_user_activity(admin_username, "Visited audit page")
    return render_template('audit.html')

@app.route('/topics/<int:grade>')
@require_login
def topics(grade):
    # Handle grade change rules centrally
    current_user = session['username']
    enforce_grade_change_rules(current_user, grade)
    
    log_user_activity(session['username'], f"Visited topics for grade {grade}")
    return render_template('topics.html', grade=grade)

@app.route('/subtopics/<int:grade>/<topic>')
@require_login
def subtopics(grade, topic):
    # Validate topic
    if topic not in SUBTOPICS:
        flash(f'Invalid topic: {topic}')
        return redirect(url_for('topics', grade=grade))
    
    # Handle grade change rules centrally
    current_user = session['username']
    enforce_grade_change_rules(current_user, grade, topic)
    
    # Get appropriate subtopics based on grade
    if grade <= 5:
        subtopic_list = SUBTOPICS[topic]['grades_5_and_below']
    else:
        subtopic_list = SUBTOPICS[topic]['grades_above_5']
    
    log_user_activity(session['username'], f"Visited subtopics for {topic} grade {grade}")
    return render_template('subtopics.html', grade=grade, topic=topic, subtopics=subtopic_list)

@app.route('/exercise/<int:grade>/<topic>')
@require_login
def exercise(grade, topic):
    # Handle grade change rules centrally
    current_user = session['username']
    enforce_grade_change_rules(current_user, grade, topic)
    
    # Load user history for difficulty adjustment
    user_data = get_user(session['username'])
    user_history = user_data.get('history', []) if user_data else []
    
    # Load prompt and call LLM service
    prompt = load_prompt(topic)
    llm_response = safe_llm_service.call_llm_api(prompt, user_history, session.get('session_id'), session.get('username'))
    
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

@app.route('/exercise/<int:grade>/<topic>/<subtopic>')
@require_login
def exercise_with_subtopic(grade, topic, subtopic):
    # Validate topic and subtopic
    if topic not in SUBTOPICS:
        flash(f'Invalid topic: {topic}')
        return redirect(url_for('topics', grade=grade))
    
    # Get appropriate subtopics based on grade
    if grade <= 5:
        subtopic_list = SUBTOPICS[topic]['grades_5_and_below']
    else:
        subtopic_list = SUBTOPICS[topic]['grades_above_5']
    
    # Find the subtopic details
    subtopic_details = None
    for st in subtopic_list:
        if st['id'] == subtopic:
            subtopic_details = st
            break
    
    if not subtopic_details:
        flash(f'Invalid subtopic: {subtopic}')
        return redirect(url_for('subtopics', grade=grade, topic=topic))
    
    # Handle grade change rules centrally
    current_user = session['username']
    enforce_grade_change_rules(current_user, grade, topic)
    
    # Update current subtopic in session
    if current_user in active_sessions:
        active_sessions[current_user]['current_subtopic'] = subtopic
    
    # Load user history for difficulty adjustment - filter by topic and subtopic
    user_data = get_user(session['username'])
    user_history = user_data.get('history', []) if user_data else []
    filtered_history = [h for h in user_history if h.get('topic') == topic and h.get('subtopic') == subtopic]
    
    # Load prompt and call LLM service with subtopic context
    prompt = load_prompt(topic)
    # Add subtopic context to the prompt
    subtopic_prompt = f"{prompt}\n\nFocus specifically on: {subtopic_details['name']} - {subtopic_details['description']}"
    
    llm_response = safe_llm_service.call_llm_api(subtopic_prompt, filtered_history, session.get('session_id'), session.get('username'))
    
    if 'error' in llm_response:
        flash(f'Error generating questions: {llm_response["error"]}')
        return redirect(url_for('subtopics', grade=grade, topic=topic))
    
    # Store questions in session
    session['current_questions'] = llm_response.get('questions', [])
    session['current_question_index'] = 0
    session['current_topic'] = topic
    session['current_subtopic'] = subtopic
    session['current_grade'] = grade
    
    log_user_activity(session['username'], f"Started exercise for {topic}/{subtopic} grade {grade}")
    return render_template('exercise.html', grade=grade, topic=topic, subtopic=subtopic, subtopic_name=subtopic_details['name'])

@app.route('/explore/<int:grade>/<topic>/<subtopic>')
@require_login
@apply_rate_limit("30 per minute")
def explore_subtopic(grade, topic, subtopic):
    """Explore page with Learn and Practice options for a specific subtopic."""
    # Validate topic and subtopic
    if topic not in SUBTOPICS:
        flash(f'Invalid topic: {topic}')
        return redirect(url_for('topics', grade=grade))
    
    # Get appropriate subtopics based on grade
    if grade <= 5:
        subtopic_list = SUBTOPICS[topic]['grades_5_and_below']
    else:
        subtopic_list = SUBTOPICS[topic]['grades_above_5']
    
    # Find the subtopic details
    subtopic_details = None
    for st in subtopic_list:
        if st['id'] == subtopic:
            subtopic_details = st
            break
    
    if not subtopic_details:
        flash(f'Invalid subtopic: {subtopic}')
        return redirect(url_for('subtopics', grade=grade, topic=topic))
    
    # Update user's current activity
    credentials = load_credentials()
    current_user = session['username']
    
    # Update active sessions
    if current_user in active_sessions:
        active_sessions[current_user]['current_topic'] = topic
        active_sessions[current_user]['current_subtopic'] = subtopic
        active_sessions[current_user]['grade'] = grade
    else:
        user_data = get_user(current_user)
        active_sessions[current_user] = {
            'session_id': session.get('session_id', str(uuid.uuid4())),
            'last_activity': datetime.now().isoformat(),
            'school_name': user_data.get('school_name', 'Unknown School') if user_data else 'Unknown School',
            'current_topic': topic,
            'current_subtopic': subtopic,
            'grade': grade
        }
    
    log_user_activity(session['username'], f"Exploring {topic}/{subtopic} grade {grade}")
    return render_template('explore.html', grade=grade, topic=topic, subtopic=subtopic, subtopic_name=subtopic_details['name'])

@app.route('/learn/<int:grade>/<topic>/<subtopic>')
@require_login
@apply_rate_limit("30 per minute")
def learn_subtopic(grade, topic, subtopic):
    """Learn mode - fetch educational content from LLM and render learn page."""
    # Validate topic and subtopic
    if topic not in SUBTOPICS:
        flash(f'Invalid topic: {topic}')
        return redirect(url_for('topics', grade=grade))
    
    # Get appropriate subtopics based on grade
    if grade <= 5:
        subtopic_list = SUBTOPICS[topic]['grades_5_and_below']
    else:
        subtopic_list = SUBTOPICS[topic]['grades_above_5']
    
    # Find the subtopic details
    subtopic_details = None
    for st in subtopic_list:
        if st['id'] == subtopic:
            subtopic_details = st
            break
    
    if not subtopic_details:
        flash(f'Invalid subtopic: {subtopic}')
        return redirect(url_for('subtopics', grade=grade, topic=topic))
    
    # Update user's current activity
    credentials = load_credentials()
    current_user = session['username']
    
    # Update active sessions
    if current_user in active_sessions:
        active_sessions[current_user]['current_topic'] = topic
        active_sessions[current_user]['current_subtopic'] = subtopic
        active_sessions[current_user]['grade'] = grade
        active_sessions[current_user]['mode'] = 'learn'
    else:
        user_data = get_user(current_user)
        active_sessions[current_user] = {
            'session_id': session.get('session_id', str(uuid.uuid4())),
            'last_activity': datetime.now().isoformat(),
            'school_name': user_data.get('school_name', 'Unknown School') if user_data else 'Unknown School',
            'current_topic': topic,
            'current_subtopic': subtopic,
            'grade': grade,
            'mode': 'learn'
        }
    
    # Initialize learning content in session
    session['learning_content'] = []
    session['current_content_index'] = 0
    session['current_topic'] = topic
    session['current_subtopic'] = subtopic
    session['current_grade'] = grade
    session['learning_mode'] = True
    
    log_user_activity(session['username'], f"Started learning mode for {topic}/{subtopic} grade {grade}")
    return render_template('learn.html', grade=grade, topic=topic, subtopic=subtopic, subtopic_name=subtopic_details['name'])

@app.route('/get_learn_content')
@require_login
@apply_auth_rate_limit("60 per minute")
def get_learn_content():
    """API endpoint to fetch current learning content."""
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    # Check if we already have learning content in session
    if 'learning_content' in session and session['learning_content']:
        content = session['learning_content']
        index = session.get('current_content_index', 0)
        
        if index >= len(content):
            return jsonify({'finished': True})
        
        return jsonify({
            'content': content,
            'index': index,
            'total': len(content)
        })
    
    # Generate new learning content
    topic = session.get('current_topic')
    subtopic = session.get('current_subtopic')
    grade = session.get('current_grade')
    
    if not all([topic, subtopic, grade]):
        return jsonify({'error': 'Missing session data'})
    
    # Get subtopic details
    if grade <= 5:
        subtopic_list = SUBTOPICS[topic]['grades_5_and_below']
    else:
        subtopic_list = SUBTOPICS[topic]['grades_above_5']
    
    subtopic_details = None
    for st in subtopic_list:
        if st['id'] == subtopic:
            subtopic_details = st
            break
    
    if not subtopic_details:
        return jsonify({'error': 'Invalid subtopic'})
    
    # Generate learning content using LLM service
    try:
        llm_response = safe_llm_service.generate_learning_content(
            topic=topic,
            subtopic_name=subtopic_details['name'],
            subtopic_description=subtopic_details['description'],
            grade=grade,
            session_id=session.get('session_id'),
            username=session.get('username')
        )
        
        if 'error' in llm_response:
            return jsonify({'error': f'Error generating learning content: {llm_response["error"]}'})
        
        # Store learning content in session
        learning_content = llm_response.get('questions', [])
        session['learning_content'] = learning_content
        session['current_content_index'] = 0
        
        return jsonify({
            'content': learning_content,
            'index': 0,
            'total': len(learning_content)
        })
        
    except Exception as e:
        app.logger.error(f"Error generating learning content: {str(e)}")
        return jsonify({'error': 'Failed to generate learning content'})

@app.route('/fetch_more_learn_content', methods=['POST'])
@require_login
@apply_auth_rate_limit("10 per minute")
def fetch_more_learn_content():
    """API endpoint to fetch additional learning content."""
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    topic = session.get('current_topic')
    subtopic = session.get('current_subtopic')
    grade = session.get('current_grade')
    
    if not all([topic, subtopic, grade]):
        return jsonify({'error': 'Missing session data'})
    
    # Get subtopic details
    if grade <= 5:
        subtopic_list = SUBTOPICS[topic]['grades_5_and_below']
    else:
        subtopic_list = SUBTOPICS[topic]['grades_above_5']
    
    subtopic_details = None
    for st in subtopic_list:
        if st['id'] == subtopic:
            subtopic_details = st
            break
    
    if not subtopic_details:
        return jsonify({'error': 'Invalid subtopic'})
    
    # Generate additional learning content using LLM service
    try:
        llm_response = safe_llm_service.generate_learning_content(
            topic=topic,
            subtopic_name=subtopic_details['name'],
            subtopic_description=subtopic_details['description'],
            grade=grade,
            session_id=session.get('session_id'),
            username=session.get('username')
        )
        
        if 'error' in llm_response:
            return jsonify({'error': f'Error generating additional content: {llm_response["error"]}'})
        
        # Get new learning content
        new_content = llm_response.get('questions', [])
        
        if not new_content:
            return jsonify({'error': 'No additional content available'})
        
        return jsonify({
            'content': new_content,
            'message': f'Generated {len(new_content)} additional learning items'
        })
        
    except Exception as e:
        app.logger.error(f"Error generating additional learning content: {str(e)}")
        return jsonify({'error': 'Failed to generate additional content'})

@app.route('/get_current_question')
@apply_auth_rate_limit("60 per minute")  # API endpoint rate limiting
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
@apply_auth_rate_limit("10 per minute")  # Limit rapid answer submissions
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
    
    # Use LLM service to check the answer
    is_correct = safe_llm_service.check_answer_with_llm(question_text, user_answer, explanation, session.get('session_id'), session.get('username'))
    
    # Prepare history entry
    username = session['username']
    question_record = {
        'question': question_text,
        'user_answer': user_answer,
        'correct': is_correct,
        'topic': session.get('current_topic'),
        'subtopic': session.get('current_subtopic'),
        'grade': session.get('current_grade'),
        'timestamp': datetime.now().isoformat()
    }
    
    # Prepare statistics updates
    statistics_updates = {
        'questions_attempted_increment': 1
    }
    
    # Add topic to covered topics if not already covered
    current_topic = session.get('current_topic')
    if current_topic:
        statistics_updates['add_topic_covered'] = current_topic
    
    # Use DBManager to atomically update both history and statistics
    db = get_app_db()
    success = db.update_user_history_and_statistics(username, question_record, statistics_updates)
    
    if not success:
        return jsonify({'error': 'Failed to save answer'})
    
    # Move to next question
    session['current_question_index'] = index + 1
    
    log_user_activity(username, f"Submitted answer '{user_answer}' for question {index + 1} - {'Correct' if is_correct else 'Incorrect'}")
    
    return jsonify({
        'correct': is_correct,
        'explanation': explanation if not is_correct else '',
        'user_answer': user_answer if not is_correct else '',
        'next_available': (index + 1) < len(questions)
    })

@app.route('/logout')
def logout():
    username = session.get('username', 'Unknown')
    session_id = session.get('session_id', None)
    
    # Clean up any pending LLM requests for this session
    if session_id:
        safe_llm_service.cleanup_session_queue_requests(session_id)
    
    # Remove from active sessions with thread safety
    with synchronized(LOCK_ACTIVE_SESSIONS):
        if username in active_sessions:
            del active_sessions[username]
    
    # End any active chat sessions
    end_all_user_chats(username)
    
    session.clear()
    log_user_activity(username, "Logged out")
    
    # Log security event for logout
    try:
        from logging_system import log_audit_event, log_security_event
        log_audit_event('logout', 'user_session', username, 'success')
        log_security_event('authentication', f'User {username} logged out', 'info')
    except Exception:
        pass  # Don't break logout if logging fails
    
    return redirect(url_for('login'))

@app.route('/check_session')
def check_session():
    """Check if user session is valid using comprehensive validation"""
    is_valid, message = validate_session()
    
    if not is_valid:
        # Clean up invalid session
        username = session.get('username', 'Unknown')
        if username in active_sessions:
            del active_sessions[username]
        session.clear()
        return jsonify({'valid': False, 'message': message})
    
    # Update activity timestamp for valid sessions
    update_user_activity(session['username'])
    return jsonify({'valid': True, 'message': 'Session is valid'})

@app.route('/rate_limit_status')
@apply_auth_rate_limit("60 per minute")
def rate_limit_status():
    """Get current rate limit status for the user"""
    if limiter is None:
        return jsonify({'rate_limiting_enabled': False})
    
    try:
        key = get_rate_limit_key()
        return jsonify({
            'rate_limiting_enabled': True,
            'key': key if 'username' in session else 'anonymous',
            'limits': {
                'global': '1000 per hour',
                'api': '60 per minute',
                'chat': '30 per minute',
                'submit': '10 per minute',
                'login': '5 per 15 minutes'
            }
        })
    except Exception as e:
        return jsonify({'error': 'Unable to get rate limit status', 'rate_limiting_enabled': True})

# Collaboration endpoints
@app.route('/get_active_users')
@apply_auth_rate_limit("60 per minute")  # API endpoint rate limiting
def get_active_users():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    cleanup_old_sessions()
    update_user_activity(session['username'])
    
    current_user = session['username']
    current_user_session = active_sessions.get(current_user, {})
    current_school = current_user_session.get('school_name', '')
    current_grade = current_user_session.get('grade', None)
    
    # Always return users array, but filter based on current user's grade and school
    active_users = []
    
    # Only show users if current user has selected a grade and is in the same school and grade
    if current_grade is not None and current_school:
        for username, session_data in active_sessions.items():
            user_school = session_data.get('school_name', '')
            user_grade = session_data.get('grade', None)
            user_topic = session_data.get('current_topic')
            
            # Debug log for collaboration filtering
            app.logger.info(f"Collaboration check - Current user: {current_user} (grade={current_grade}, school='{current_school}'), "
                          f"Checking user: {username} (grade={user_grade}, school='{user_school}', topic={user_topic})")
            
            if (username != current_user and 
                user_school == current_school and
                user_grade == current_grade and  # Same grade requirement
                user_topic is not None):  # User must be actively working on a topic
                
                active_users.append({
                    'username': username,
                    'topic': user_topic,
                    'grade': user_grade
                })
                app.logger.info(f"Collaboration: Added user {username} to active list")
    else:
        app.logger.info(f"Collaboration: Current user {current_user} doesn't have grade ({current_grade}) or school ('{current_school}') set")
    
    # Always return the users array - empty if no matches or user hasn't selected grade
    # This ensures the collaborate badge always shows with appropriate message
    return jsonify({'users': active_users})

@app.route('/send_collaboration_invite', methods=['POST'])
@apply_auth_rate_limit("10 per hour")  # Limit collaboration invite spam
def send_collaboration_invite():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    # Sanitize input
    validator = get_input_validator(app.logger)
    try:
        target_user = validator.sanitize_username(data.get('target_user', ''))
        from_user = session['username']
    except ValueError as e:
        return jsonify({'error': f'Invalid target user: {str(e)}'})
    
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
    
    # Thread-safe invite sending with atomic operations
    try:
        db = get_app_db()
        invite_id = db.create_invite(from_user, target_user)
        
        if invite_id:
            log_user_activity(from_user, f"Sent collaboration invite to {target_user}")
            return jsonify({'success': True, 'invite_id': invite_id})
        else:
            return jsonify({'error': 'Failed to create invite'})
            
    except Exception as e:
        app.logger.error(f"Failed to send invite from {from_user} to {target_user}: {e}")
        return jsonify({'error': 'Failed to send invite'})

@app.route('/check_collaboration_invites')
@apply_auth_rate_limit("60 per minute")  # API endpoint rate limiting
def check_collaboration_invites():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    update_user_activity(session['username'])
    username = session['username']
    
    try:
        db = get_app_db()
        
        # Check for pending invites for this user
        pending_invite = db.get_pending_invite_for_user(username)
        if pending_invite:
            return jsonify({'invite': pending_invite})
        
        # Check if user has an active chat session
        partner = db.get_active_chat_partner(username)
        if partner:
            return jsonify({'accepted_chat': {'partner': partner}})
        
        return jsonify({'invite': None})
        
    except Exception as e:
        app.logger.error(f"Failed to check invites for {username}: {e}")
        return jsonify({'invite': None})

@app.route('/respond_collaboration_invite', methods=['POST'])
@apply_auth_rate_limit("30 per minute")  # Limit invite responses
def respond_collaboration_invite():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    from_user = data.get('from_user')
    accept = data.get('accept', False)
    current_user = session['username']
    
    # Sanitize inputs
    if not isinstance(from_user, str) or not from_user.strip():
        return jsonify({'error': 'Invalid from_user'})
    
    from_user = from_user.strip()
    
    # Get database connection
    db = get_app_db()
    
    # Update invite status in database
    status = 'accepted' if accept else 'declined'
    success = db.update_invite_status_by_users(from_user, current_user, status)
    
    if not success:
        return jsonify({'error': 'Invite not found or already processed'})
    
    # Log the activity
    if accept:
        log_user_activity(current_user, f"Accepted collaboration invite from {from_user}")
    else:
        log_user_activity(current_user, f"Declined collaboration invite from {from_user}")
    
    return jsonify({'success': True})

@app.route('/send_chat_message', methods=['POST'])
@apply_auth_rate_limit("30 per minute")  # Prevent chat spam
def send_chat_message():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    # Sanitize input data
    validator = get_input_validator(app.logger)
    try:
        to_user = validator.sanitize_username(data.get('to_user', ''))
        message = validator.sanitize_chat_message(data.get('message', ''))
        from_user = session['username']
    except ValueError as e:
        return jsonify({'error': f'Invalid input: {str(e)}'})
    
    if not message or len(message) > 200:
        return jsonify({'error': 'Invalid message length'})
    
    # Check if users are in same grade and school before allowing chat
    current_user_session = active_sessions.get(from_user)
    if not current_user_session:
        return jsonify({'error': 'No active exercise session'})
    
    current_grade = current_user_session.get('grade')
    current_school = current_user_session.get('school_name')
    
    # Find partner's session
    partner_session = active_sessions.get(to_user)
    
    if not partner_session:
        return jsonify({'error': 'Partner not in active session'})
    
    partner_grade = partner_session.get('grade')
    partner_school = partner_session.get('school_name')
    
    # Validate same grade and school
    if current_grade != partner_grade or current_school != partner_school:
        return jsonify({'error': 'Cannot chat with users from different grade or school'})
    
    try:
        db = get_app_db()
        
        # Find or create active chat session
        session_id = db.find_active_chat_session(from_user, to_user)
        if not session_id:
            session_id = db.create_chat_session(from_user, to_user)
        
        # Add message to database (message will be obfuscated internally)
        message_id = db.add_message(session_id, from_user, to_user, message)
        app.logger.info(f"Added message from {from_user} to {to_user} in session {session_id}")
        
        return jsonify({'success': True, 'message_id': message_id})
        
    except Exception as e:
        app.logger.error(f"Failed to send message from {from_user} to {to_user}: {e}")
        return jsonify({'error': 'Failed to send message'})

@app.route('/get_chat_messages')
@apply_auth_rate_limit("60 per minute")  # API endpoint rate limiting
def get_chat_messages():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    partner = request.args.get('partner')
    current_user = session['username']
    
    if not partner:
        return jsonify({'error': 'Partner not specified'})
    
    # Check if users are in same grade and school before allowing chat
    current_user_session = active_sessions.get(current_user)
    if not current_user_session:
        return jsonify({'messages': []})  # Return empty if no active session
    
    current_grade = current_user_session.get('grade')
    current_school = current_user_session.get('school_name')
    
    # Find partner's session
    partner_session = active_sessions.get(partner)
    
    if not partner_session:
        return jsonify({'messages': []})  # Return empty if partner not in session
    
    partner_grade = partner_session.get('grade')
    partner_school = partner_session.get('school_name')
    
    # Validate same grade and school
    if current_grade != partner_grade or current_school != partner_school:
        return jsonify({'messages': []})  # Return empty if different grade/school
    
    try:
        db = get_app_db()
        
        # Get messages from database
        all_messages = db.get_chat_messages(current_user, partner)
        
        # Filter messages for current user that haven't been displayed
        messages = []
        for msg in all_messages:
            if msg['to_user'] == current_user and not msg['displayed']:
                # Create a copy of the message with deobfuscated content for display
                message_copy = msg.copy()
                
                # CRITICAL FIX: Ensure proper deobfuscation with error handling
                try:
                    if is_message_obfuscated(msg['message']):
                        deobfuscated_content = deobfuscate_message(msg['message'])
                        message_copy['message'] = deobfuscated_content
                        app.logger.info(f"Deobfuscated message from {msg['from_user']}: '{msg['message'][:20]}...' -> '{deobfuscated_content}'")
                    else:
                        # Message is not obfuscated, use as-is
                        app.logger.warning(f"Message from {msg['from_user']} was not obfuscated: '{msg['message']}'")
                        message_copy['message'] = msg['message']
                except Exception as e:
                    app.logger.error(f"Failed to deobfuscate message from {msg['from_user']}: {e}")
                    # Fallback: show error message to prevent displaying raw obfuscated text
                    message_copy['message'] = "[Message decode error]"
                
                messages.append(message_copy)
        
        return jsonify({'messages': messages})
        
    except Exception as e:
        app.logger.error(f"Failed to get chat messages for {current_user} and {partner}: {e}")
        return jsonify({'messages': []})

@app.route('/mark_message_displayed', methods=['POST'])
@apply_auth_rate_limit("60 per minute")  # API endpoint rate limiting
def mark_message_displayed():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    message_id = data.get('message_id')
    
    try:
        db = get_app_db()
        success = db.update_message_displayed(message_id, True)
        
        if success:
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Message not found'})
            
    except Exception as e:
        app.logger.error(f"Failed to mark message {message_id} as displayed: {e}")
        return jsonify({'error': 'Failed to update message'})

@app.route('/end_chat', methods=['POST'])
@apply_auth_rate_limit("30 per minute")  # Limit chat management actions
def end_chat():
    if 'username' not in session:
        return jsonify({'error': 'No active session'})
    
    data = request.get_json()
    partner = data.get('partner')
    current_user = session['username']
    
    # Validate inputs
    if not isinstance(partner, str) or not partner.strip():
        return jsonify({'error': 'Invalid partner'})
    
    partner = partner.strip()
    
    # Get database connection
    db = get_app_db()
    
    # End all chat sessions between the two users
    success = db.end_all_user_chats(current_user)
    
    if success:
        log_user_activity(current_user, f"Ended chat session with {partner}")
        return jsonify({'success': True})
    else:
        return jsonify({'error': 'Failed to end chat session'})

@app.route('/games/<int:grade>')
@require_login
@apply_auth_rate_limit("30 per minute")  # Limit games access to prevent abuse
def games_list(grade):
    """Display available games for a specific grade"""
    if grade < 1 or grade > 7:
        flash('Games are only available for grades 1-7')
        return redirect(url_for('topics', grade=1))
    
    # Simple list of available games (no database needed)
    games = [
        {
            'name': 'AMCA Thrust',
            'slug': 'tejas-thrust',
            'description': 'A kid-friendly fighter plane game where you pilot a blue plane and battle enemy aircraft!'
        },
        {
            'name': 'Tank Attack',
            'slug': 'tank-attack',
            'description': 'Control a blue dot and defend against enemy tanks! Collect power boosts to unleash devastating fireballs!'
        }
    ]
    
    log_user_activity(session['username'], f"Visited games for grade {grade}")
    return render_template('games/games_list.html', games=games, grade=grade, logo_path=LOGO_PATH)

@app.route('/games/play/<string:game_slug>')
@require_login
@apply_auth_rate_limit("20 per minute")  # Limit game play requests
def game_detail(game_slug):
    """Display a specific game"""
    # Define available games
    available_games = {
        'tejas-thrust': {
            'name': 'AMCA Thrust',
            'slug': 'tejas-thrust',
            'description': 'A kid-friendly fighter plane game where you pilot a blue plane and battle enemy aircraft!'
        },
        'tank-attack': {
            'name': 'Tank Attack',
            'slug': 'tank-attack',
            'description': 'Control a blue dot and defend against enemy tanks! Collect power boosts to unleash devastating fireballs!'
        }
    }
    
    if game_slug not in available_games:
        flash('Game not found')
        return redirect(url_for('games_list', grade=1))
    
    game = available_games[game_slug]
    
    log_user_activity(session['username'], f"Started playing {game_slug}")
    return render_template('games/game_detail.html', game=game, logo_path=LOGO_PATH)


# Production Session Health Endpoints
@app.route('/health/sessions')
def session_health():
    """Get session storage health status."""
    try:
        if production_sessions:
            health_status = production_sessions.get_health_status()
            return jsonify(health_status)
        else:
            return jsonify({
                'status': 'basic',
                'message': 'Using basic filesystem sessions',
                'components': {
                    'session_storage': {
                        'status': 'healthy',
                        'message': 'Basic filesystem sessions active'
                    }
                }
            })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Failed to get session health: {str(e)}'
        }), 500


@app.route('/health/sessions/metrics')
def session_metrics():
    """Get session storage metrics."""
    try:
        if production_sessions:
            metrics = production_sessions.get_session_metrics()
            return jsonify(metrics)
        else:
            # Basic metrics for filesystem sessions
            return jsonify({
                'total_sessions': len(active_sessions),
                'active_sessions': len(active_sessions),
                'session_type': 'filesystem_basic',
                'redis_available': False
            })
    except Exception as e:
        return jsonify({
            'error': f'Failed to get session metrics: {str(e)}'
        }), 500


@app.route('/health/sessions/cleanup', methods=['POST'])
@require_login
def cleanup_sessions():
    """Manually trigger session cleanup (admin only)."""
    try:
        username = session.get('username')
        if username != 'admin@gmail.com':  # Only admin can trigger cleanup
            return jsonify({'error': 'Unauthorized'}), 403
        
        if production_sessions:
            cleaned_count = production_sessions.cleanup_expired_sessions()
            return jsonify({
                'success': True,
                'cleaned_sessions': cleaned_count,
                'message': f'Cleaned up {cleaned_count} expired sessions'
            })
        else:
            return jsonify({
                'success': True,
                'cleaned_sessions': 0,
                'message': 'Basic session storage does not require cleanup'
            })
    except Exception as e:
        return jsonify({
            'error': f'Failed to cleanup sessions: {str(e)}'
        }), 500


if __name__ == '__main__':
    # Initialize production logging system
    logging_integration = initialize_production_logging()
    
    # Initialize concurrency management
    concurrency_manager = initialize_concurrency_manager(app.logger)
    
    # Initialize input validator
    input_validator = get_input_validator(app.logger)
    
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='NinjaNerd Educational Platform')
    parser.add_argument('-d', '--deepseek', action='store_true', 
                       help='Use DeepSeek LLM model (default)')
    parser.add_argument('-o', '--openai', action='store_true', 
                       help='Use OpenAI LLM model')
    
    args = parser.parse_args()
    
    # Determine which LLM model to use
    if args.openai:
        LLM_MODEL_TYPE = 'openai'
        print("🤖 Using OpenAI LLM model")
    elif args.deepseek:
        LLM_MODEL_TYPE = 'deepseek'
        print("🤖 Using DeepSeek LLM model")
    else:
        # Default to deepseek if neither specified
        LLM_MODEL_TYPE = 'deepseek'
        print("🤖 Using DeepSeek LLM model (default)")
    
    # Initialize LLM service with the chosen model
    llm_service = LLMService(logger=app.logger, model_type=LLM_MODEL_TYPE)
    
    # Initialize the safe LLM service facade with the real service
    safe_llm_service = initialize_safe_llm_service(llm_service, app.logger)
    
    # Set active sessions reference for LLM service
    llm_service.set_active_sessions_reference(active_sessions)
    
    # Initialize SQLite DBManager (required - no fallback)
    try:
        app.logger.info("Initializing SQLite DBManager...")
        initialize_app_db(app, db_path='data/ninjanerd.db')
        app.logger.info("SQLite DBManager initialized successfully")
    except Exception as e:
        app.logger.error(f"Failed to initialize SQLite DBManager: {e}")
        app.logger.error("SQLite database is required for application operation")
        print(f"❌ CRITICAL ERROR: SQLite database initialization failed: {e}")
        print("❌ Application cannot start without SQLite database")
        print("🔧 Please check database permissions and disk space")
        sys.exit(1)  # Exit application as SQLite is required
    
    init_credentials_db()
    init_collaboration_db()
    
    # Initialize session cleanup scheduler
    session_cleanup_scheduler = SessionCleanupScheduler(cleanup_interval_minutes=5)
    session_cleanup_scheduler.register_cleanup_function(cleanup_old_sessions)
    session_cleanup_scheduler.start()
    
    # Setup cleanup handlers
    def cleanup_on_exit():
        """Cleanup function for graceful shutdown"""
        global logging_integration
        print("Starting graceful shutdown...")
        
        # Shutdown session cleanup scheduler
        try:
            print("Shutting down session cleanup scheduler...")
            session_cleanup_scheduler.stop()
            print("Session cleanup scheduler shutdown completed")
        except Exception as e:
            print(f"Error during session cleanup scheduler shutdown: {e}")
        
        # Shutdown logging system
        try:
            if logging_integration:
                print("Shutting down logging system...")
                logging_integration.shutdown()
                print("Logging system shutdown completed")
        except Exception as e:
            print(f"Error during logging cleanup: {e}")
        
        # Shutdown DBManager
        try:
            from dbmgr.sqlite_app_integration import get_app_db
            db = get_app_db()
            if db:
                print("Shutting down DBManager...")
                db.shutdown()
                print("DBManager shutdown completed")
        except Exception as e:
            print(f"Error during DBManager cleanup: {e}")
        
        # Additional cleanup - check for any remaining threads
        try:
            import threading
            active_threads = threading.active_count()
            print(f"Active threads after cleanup: {active_threads}")
            
            # List all active threads for debugging
            for thread in threading.enumerate():
                if thread != threading.current_thread():
                    print(f"  - Thread: {thread.name} (daemon: {thread.daemon})")
                    if hasattr(thread, '_stop'):
                        try:
                            thread._stop()
                        except:
                            pass
        except Exception as e:
            print(f"Error during thread cleanup: {e}")
            
        print("Graceful shutdown completed")
    
    import signal
    import atexit
    import sys
    
    def signal_handler(signum, frame):
        """Handle signals for graceful shutdown"""
        print(f"\nReceived signal {signum}, shutting down gracefully...")
        try:
            cleanup_on_exit()
        except Exception as e:
            print(f"Error during cleanup: {e}")
        
        print("Forcing immediate exit...")
        import os
        os._exit(0)  # Use os._exit for immediate termination
    
    # Register cleanup function and signal handlers
    atexit.register(cleanup_on_exit)
    
    # Set signal handlers only if we're in the main thread
    try:
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        print("Signal handlers registered successfully")
    except ValueError as e:
        # This can happen if we're not in the main thread
        print(f"Could not register signal handlers: {e}")
        print("Signal handling may not work properly")

    # SSL Configuration
    context = ssl.SSLContext(ssl.PROTOCOL_TLSv1_2)
    
    # Path to your certificates
    cert_path = os.path.join(os.path.dirname(__file__), 'ssl_certs', 'cert.pem')
    key_path = os.path.join(os.path.dirname(__file__), 'ssl_certs', 'key.pem')

    try:
        context.load_cert_chain(cert_path, key_path)

        app.run(
            host='0.0.0.0',
            port=8443,  # Using 8443 to avoid needing sudo
            debug=False,  # Set to False for HTTPS
            ssl_context=context,
            use_reloader=False,  # Disable reloader to prevent signal conflicts
            threaded=True  # Enable threading for better performance
        )
    except FileNotFoundError as e:
        print("❌ SSL certificates not found!")
        print("📁 Expected files:")
        print(f"   - {cert_path}")
        print(f"   - {key_path}")
        print("🔧 Please ensure certificates are generated in ssl_certs folder.")
        print("\n🔄 Falling back to HTTP...")
        app.run(debug=True, host='0.0.0.0', port=5001, use_reloader=False, threaded=True)
    except Exception as e:
        print(f"❌ SSL Error: {e}")
        print("🔄 Falling back to HTTP...")
        app.run(debug=True, host='0.0.0.0', port=5001, use_reloader=False, threaded=True)