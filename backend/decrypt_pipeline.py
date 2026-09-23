import os
import subprocess

def decrypt_whatsapp_backup(crypt_file_path, key_path, output_db_path="msgstore.db"):
    """
    Phase 1: Decrypts E2EE WhatsApp .crypt15 backup into an SQLite database.
    """
    print("Initializing Phase 1: Local Decryption Pipeline...")
    
    # Validate files exist
    if not os.path.exists(crypt_file_path):
        print(f"[!] Error: Backup file '{crypt_file_path}' not found.")
        return False
        
    if not os.path.exists(key_path):
        print(f"[!] Error: Key file '{key_path}' not found.")
        return False

    # Command based on wa-crypt-tools syntax
    command = [
        "wadecrypt",
        key_path,
        crypt_file_path,
        output_db_path
    ]
    
    try:
        print(f"Decrypting {crypt_file_path}...")
        # Execute the wadecrypt shell command
        subprocess.run(command, check=True)
        print(f"[+] Success! Decrypted database saved to: {output_db_path}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[!] Decryption failed. Please verify your key file. Error: {e}")
        return False

if __name__ == "__main__":
    # Ensure these files are placed in your backend folder for testing
    CRYPT15_FILE = "msgstore.db.crypt15"
    KEY_FILE = "encrypted_backup.key"  # Or your 64-character hex key file
    OUTPUT_FILE = "msgstore.db"
    
    decrypt_whatsapp_backup(CRYPT15_FILE, KEY_FILE, OUTPUT_FILE)
