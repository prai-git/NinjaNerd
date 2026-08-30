"""
Porkbun Gateway Module
Provides functionality to interact with Porkbun DNS API
"""

import requests
import json
import os
import logging

# Use the application's logging system architecture
logger = logging.getLogger(__name__)


def get_a_records_public_ip(domain, api_key, secret_key):
    """
    Retrieve Type A DNS records from Porkbun for a domain
    Returns a list of A records with their public IP addresses
    
    Args:
        domain (str): Domain name (e.g., 'ninjanerd.ai')
        api_key (str): Porkbun API key
        secret_key (str): Porkbun secret key
    
    Returns:
        list: List of dictionaries containing A record details
    """
    url = f"https://api.porkbun.com/api/json/v3/dns/retrieve/{domain}"
    
    payload = {
        "secretapikey": secret_key,
        "apikey": api_key
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if data.get('status') == 'SUCCESS':
            # Filter only Type A records
            a_records = []
            for record in data.get('records', []):
                if record.get('type') == 'A':
                    a_records.append({
                        'id': record.get('id'),
                        'name': record.get('name', ''),
                        'content': record.get('content'),  # This is the public IP
                        'ttl': record.get('ttl'),
                        'subdomain': record.get('name') if record.get('name') != domain else ''
                    })
            
            return a_records
        else:
            print(f"ERROR: Failed to retrieve DNS records: {data}")
            return []
            
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Network request failed: {e}")
        return []
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON response: {e}")
        return []
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}")
        return []


def dns_public_ip_check():
    """
    Check public IP addresses for ninjanerd.ai and www.ninjanerd.ai domains
    Uses environment variables PR_PB_API_KEY and PR_PB_SECRET_KEY
    Prints the content (public IP) of Type A records
    """
    api_key = os.getenv('PR_PB_API_KEY')
    secret_key = os.getenv('PR_PB_SECRET_KEY')
    
    if not api_key or not secret_key:
        print("ERROR: Missing Porkbun API credentials. Please set PR_PB_API_KEY and PR_PB_SECRET_KEY environment variables.")
        return
    
    domains = ['ninjanerd.ai']
    
    for domain in domains:
        print(f"\n--- Checking Type A records for {domain} ---")
        a_records = get_a_records_public_ip(domain, api_key, secret_key)
        
        if a_records:
            for record in a_records:
                print(f"Public IP: {record['content']}")
                print(f"Record ID: {record['id']}")
                print(f"Name: {record['name']}")
                print(f"TTL: {record['ttl']}")
                if record['subdomain']:
                    print(f"Subdomain: {record['subdomain']}")
                print("---")
        else:
            print(f"No Type A records found for {domain}")
        print()


def get_home_public_ip():
    """
    Get the current public IP address of the home network
    Works on both Mac and Raspberry Pi (Linux)
    
    Returns:
        str: Public IP address or None if failed
    """
    # List of public IP services to try (in order of preference)
    ip_services = [
        "https://api.ipify.org",
        "https://icanhazip.com",
        "https://checkip.amazonaws.com",
        "https://ipecho.net/plain",
        "https://whatismyip.akamai.com"
    ]
    
    for service in ip_services:
        try:
            response = requests.get(service, timeout=10)
            response.raise_for_status()
            
            # Clean up the response (remove whitespace/newlines)
            public_ip = response.text.strip()
            
            # Basic IP validation (simple check for IPv4 format)
            if public_ip and '.' in public_ip and len(public_ip.split('.')) == 4:
                return public_ip
                
        except requests.exceptions.RequestException as e:
            print(f"Failed to get IP from {service}: {e}")
            continue
        except Exception as e:
            print(f"Unexpected error with {service}: {e}")
            continue
    
    print("ERROR: Failed to retrieve public IP from all services")
    return None


def home_public_ip_check():
    """
    Check and display the current home public IP address
    Works on both Mac and Raspberry Pi
    """
    print("\n--- Checking Home Public IP ---")
    public_ip = get_home_public_ip()
    
    if public_ip:
        print(f"Home Public IP: {public_ip}")
    else:
        print("Failed to retrieve home public IP")
    print()


def update_dns_record(record_id, domain, subdomain, new_ip, api_key, secret_key):
    """
    Update a DNS A record with a new IP address
    
    Args:
        record_id (str): DNS record ID to update
        domain (str): Domain name
        subdomain (str): Subdomain name ('' for root, 'www' for www)
        new_ip (str): New IP address to set
        api_key (str): Porkbun API key
        secret_key (str): Porkbun secret key
    
    Returns:
        dict: Result of the update operation
    """
    
    url = f"https://api.porkbun.com/api/json/v3/dns/edit/{domain}/{record_id}"
    
    payload = {
        "secretapikey": secret_key,
        "apikey": api_key,
        "name": subdomain,
        "content": new_ip,
        "type": "A"
    }
    
    try:
        logger.info(f"Attempting to update DNS record {record_id} for domain {domain} subdomain {subdomain} to IP {new_ip}")

        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        
        if data.get('status') == 'SUCCESS':
            logger.info(f"Successfully updated DNS record {record_id} for {domain} to {new_ip}")
            return {
                'success': True,
                'message': f"DNS record {record_id} updated successfully",
                'record_id': record_id,
                'new_ip': new_ip
            }
        else:
            error_msg = f"Failed to update DNS record {record_id}: {data}"
            logger.error(error_msg)
            return {
                'success': False,
                'error': error_msg
            }
            
    except requests.exceptions.RequestException as e:
        error_msg = f"Network request failed while updating DNS record {record_id}: {e}"
        logger.error(error_msg)
        return {
            'success': False,
            'error': error_msg
        }
    except json.JSONDecodeError as e:
        error_msg = f"Invalid JSON response while updating DNS record {record_id}: {e}"
        logger.error(error_msg)
        return {
            'success': False,
            'error': error_msg
        }
    except Exception as e:
        error_msg = f"Unexpected error while updating DNS record {record_id}: {e}"
        logger.error(error_msg)
        return {
            'success': False,
            'error': error_msg
        }


def compare_and_update_dns():
    """
    Compare DNS A records for ninjanerd.ai subdomains ['', 'www'] with current home IP
    If DNS records don't match home IP, update them to match the current home IP
    Uses environment variables PR_PB_API_KEY and PR_PB_SECRET_KEY
    """
    
    # Get API credentials
    api_key = os.getenv('PR_PB_API_KEY')
    secret_key = os.getenv('PR_PB_SECRET_KEY')
    
    if not api_key or not secret_key:
        error_msg = "Missing Porkbun API credentials. Please set PR_PB_API_KEY and PR_PB_SECRET_KEY environment variables."
        logger.error(error_msg)
        print(f"ERROR: {error_msg}")
        return
    
    # Get current home public IP
    logger.info("Starting DNS comparison and update process")
    
    print("\n--- DNS Comparison and Update Process ---")
    
    home_ip = get_home_public_ip()
    if not home_ip:
        error_msg = "Failed to retrieve current home public IP"
        logger.error(error_msg)
        print(f"ERROR: {error_msg}")
        return
    
    print(f"Current Home IP: {home_ip}")
    
    # Get DNS A records for ninjanerd.ai
    domain = 'ninjanerd.ai'
    a_records = get_a_records_public_ip(domain, api_key, secret_key)
    
    if not a_records:
        error_msg = f"Failed to retrieve DNS records for {domain}"
        logger.error(error_msg)
        print(f"ERROR: {error_msg}")
        return
    
    # Filter records for subdomains '' (root) and 'www'
    target_subdomains = ['', 'www']
    records_to_check = []
    
    for record in a_records:
        record_name = record.get('name', '')
        subdomain = record.get('subdomain', '')
        
        # Root domain check (name equals domain)
        if record_name == domain:
            records_to_check.append({
                'record': record,
                'subdomain_type': 'root',
                'display_name': domain
            })
        # WWW subdomain check
        elif record_name == f'www.{domain}':
            records_to_check.append({
                'record': record,
                'subdomain_type': 'www', 
                'display_name': f'www.{domain}'
            })
    
    if not records_to_check:
        error_msg = f"No A records found for root domain or www subdomain of {domain}"
        logger.error(error_msg)
        print(f"ERROR: {error_msg}")
        return
    
    # Compare and update records
    updates_needed = []
    for item in records_to_check:
        record = item['record']
        record_ip = record['content']
        record_id = record['id']
        display_name = item['display_name']
        
        print(f"\nChecking {display_name}:")
        print(f"  DNS IP: {record_ip}")
        print(f"  Home IP: {home_ip}")
        
        if record_ip == home_ip:
            print(f"IP addresses match - no update needed")
            logger.info(f"DNS record for {display_name} matches home IP {home_ip}")
        else:
            print(f"IP addresses differ - update needed")
            updates_needed.append({
                'record_id': record_id,
                'current_ip': record_ip,
                'new_ip': home_ip,
                'display_name': display_name
            })
            logger.info(f"DNS record for {display_name} needs update from {record_ip} to {home_ip}")
    
    # Perform updates
    if not updates_needed:
        print(f"\nAll DNS records are up to date!")
        logger.info("All DNS records match current home IP - no updates needed")
        return
    
    print(f"\n🔄 Updating {len(updates_needed)} DNS record(s)...")
    
    for update in updates_needed:
        print(f"\nUpdating {update['display_name']} from {update['current_ip']} to {update['new_ip']}...")
        
        # Extract subdomain for update function
        
        subdomain = ''
        if update['display_name'] == domain:
            subdomain = ''
        elif update['display_name'] == f'www.{domain}':
            subdomain = 'www'
            print(f"Subdomain extracted: {subdomain}")
            
        result = update_dns_record(
            record_id=update['record_id'],
            domain=domain,
            subdomain=subdomain,
            new_ip=update['new_ip'],
            api_key=api_key,
            secret_key=secret_key
        )
        
        if result['success']:
            print(f"Successfully updated {update['display_name']}")
            logger.info(f"Successfully updated DNS record for {update['display_name']} to {update['new_ip']}")
        else:
            print(f"Failed to update {update['display_name']}: {result['error']}")
            logger.error(f"Failed to update DNS record for {update['display_name']}: {result['error']}")
    
    print(f"\nDNS update process completed!")
    logger.info("DNS comparison and update process completed")