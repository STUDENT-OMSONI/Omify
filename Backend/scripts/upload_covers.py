import os
import sqlite3
import getpass
import requests

BUCKET_ID = None
BUCKET_NAME = "Omify-songs"

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DB_PATH = os.path.join(ROOT, "Backend", "omify.db")
COVERS_DIR = os.path.join(ROOT, "covers", "extracted")

key_id = input("Backblaze Key ID: ").strip()
application_key = getpass.getpass("Backblaze Application Key: ")

# 1. Authorize with Backblaze Native API
auth = requests.get(
    "https://api.backblazeb2.com/b2api/v4/b2_authorize_account",
    auth=(key_id, application_key),
)

auth.raise_for_status()
auth_data = auth.json()

storage_api = auth_data["apiInfo"]["storageApi"]

api_url = storage_api["apiUrl"]
download_url = storage_api["downloadUrl"]
account_auth_token = auth_data["authorizationToken"]

print("Backblaze authentication successful.")

# 2. Find the bucket
bucket_response = requests.post(
    f"{api_url}/b2api/v4/b2_list_buckets",
    headers={"Authorization": account_auth_token},
    json={
        "accountId": auth_data["accountId"],
        "bucketName": BUCKET_NAME,
    },
)

bucket_response.raise_for_status()

buckets = bucket_response.json()["buckets"]

for bucket in buckets:
    if bucket["bucketName"] == BUCKET_NAME:
        BUCKET_ID = bucket["bucketId"]
        break

if not BUCKET_ID:
    raise RuntimeError(f"Bucket not found: {BUCKET_NAME}")

print(f"Bucket found: {BUCKET_NAME}")

# 3. Get an upload URL
upload_response = requests.post(
    f"{api_url}/b2api/v4/b2_get_upload_url",
    headers={"Authorization": account_auth_token},
    json={"bucketId": BUCKET_ID},
)

if not upload_response.ok:
    print("Backblaze error:", upload_response.text)
    upload_response.raise_for_status()
upload_data = upload_response.json()

upload_url = upload_data["uploadUrl"]
upload_auth_token = upload_data["authorizationToken"]

# 4. Get the covers referenced by the database
conn = sqlite3.connect(DB_PATH)
rows = conn.execute("SELECT id, album_art FROM songs").fetchall()
conn.close()

uploaded = 0
missing = 0

for song_id, album_art in rows:
    if not album_art:
        continue

    filename = os.path.basename(album_art)
    local_path = os.path.join(COVERS_DIR, filename)

    if not os.path.isfile(local_path):
        print(f"MISSING: {filename}")
        missing += 1
        continue

    with open(local_path, "rb") as f:
        data = f.read()

    b2_key = f"covers/{filename}"

    content_type = (
        "image/png"
        if filename.lower().endswith(".png")
        else "image/jpeg"
    )

    response = requests.post(
        upload_url,
        headers={
            "Authorization": upload_auth_token,
            "X-Bz-File-Name": requests.utils.quote(b2_key, safe="/"),
            "Content-Type": content_type,
            "Content-Length": str(len(data)),
            "X-Bz-Content-Sha1": "do_not_verify",
        },
        data=data,
    )

    response.raise_for_status()

    uploaded += 1
    print(f"[{uploaded}] {filename} -> {b2_key}")

    # Refresh upload URL when needed
    if uploaded % 50 == 0:
        upload_response = requests.post(
            f"{api_url}/b2api/v4/b2_get_upload_url",
            headers={"Authorization": account_auth_token},
            json={"bucketId": BUCKET_ID},
        )
        if not upload_response.ok:
            print("Backblaze error:", upload_response.text)
            upload_response.raise_for_status()
        upload_data = upload_response.json()
        upload_url = upload_data["uploadUrl"]
        upload_auth_token = upload_data["authorizationToken"]

print()
print(f"Uploaded: {uploaded}")
print(f"Missing: {missing}")
