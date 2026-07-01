import urllib.request
import urllib.parse
import json
import base64
import time
import os
import zipfile
import sys
import glob

# Credentials
# Credentials — set via environment variables: DEVOPS_TOKEN and GITHUB_TOKEN
devops_token = os.environ.get('DEVOPS_TOKEN', '')
github_token = os.environ.get('GITHUB_TOKEN', '')
if not devops_token or not github_token:
    print("Error: DEVOPS_TOKEN and GITHUB_TOKEN environment variables must be set.", file=sys.stderr)
    sys.exit(1)
repo = 'zumuuser/loratrainer'

# Auth headers
devops_auth = base64.b64encode(f':{devops_token}'.encode()).decode()
devops_headers = {
    'Authorization': f'Basic {devops_auth}',
    'Accept': 'application/json'
}

github_headers = {
    'Authorization': f'token {github_token}',
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'loratrainer-release-agent'
}

def request_json(url, headers=None, method='GET', data=None):
    req = urllib.request.Request(url, headers=headers or {}, method=method)
    if data:
        req.data = json.dumps(data).encode('utf-8')
        req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        print(f"HTTP Error {e.code} for URL {url}: {body}", file=sys.stderr)
        raise e

# 1. Trigger a new pipeline run
trigger_url = "https://dev.azure.com/mushkudianizuka/LoRA%20Trainer/_apis/pipelines/2/runs?api-version=7.1"
trigger_data = {"resources": {"repositories": {"self": {"refName": "refs/heads/main"}}}}
trigger_res = request_json(trigger_url, headers=devops_headers, method='POST', data=trigger_data)
run_id = trigger_res['id']
print(f"Pipeline run triggered! Run ID: {run_id}")

# 2. Poll until complete
build_url = f"https://dev.azure.com/mushkudianizuka/LoRA%20Trainer/_apis/build/builds/{run_id}?api-version=7.1"
print(f"Polling build {run_id}...")

while True:
    try:
        build_info = request_json(build_url, headers=devops_headers)
        status = build_info.get('status')
        result = build_info.get('result')
        print(f"Build status: {status}, Result: {result}")
        
        if status == 'completed':
            if result == 'succeeded':
                print("Build succeeded!")
                break
            else:
                print(f"Build completed with failure result: {result}")
                sys.exit(1)
        
        time.sleep(30)
    except Exception as e:
        print(f"Polling error: {e}")
        time.sleep(15)

# 3. Get artifacts
print("Fetching build artifacts info...")
artifacts_url = f"https://dev.azure.com/mushkudianizuka/LoRA%20Trainer/_apis/build/builds/{run_id}/artifacts?api-version=7.1"
artifacts_data = request_json(artifacts_url, headers=devops_headers)

os.makedirs('build_artifacts', exist_ok=True)
downloaded_files = []

for art in artifacts_data.get('value', []):
    name = art.get('name')
    download_url = art.get('resource', {}).get('downloadUrl')
    if not download_url:
        continue
    
    zip_path = f"build_artifacts/{name}.zip"
    print(f"Downloading artifact {name} from {download_url}...")
    
    req = urllib.request.Request(download_url, headers=devops_headers)
    with urllib.request.urlopen(req) as res, open(zip_path, 'wb') as out:
        out.write(res.read())
        
    print(f"Extracting {zip_path}...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall('build_artifacts')
        
    downloaded_files.append(zip_path)

# Find compiled packages (.deb and .exe)
deb_files = glob.glob('build_artifacts/**/*.deb', recursive=True)
exe_files = glob.glob('build_artifacts/**/*.exe', recursive=True)

release_assets = deb_files + exe_files
if not release_assets:
    print("Error: No .deb or .exe package artifacts found!")
    sys.exit(1)

print(f"Found assets to upload: {release_assets}")

# 4. Create or Get GitHub Release v0.6.5
tag = 'v0.6.5'
release_url = f"https://api.github.com/repos/{repo}/releases"
release_data = {
    "tag_name": tag,
    "target_commitish": "main",
    "name": f"Release {tag}",
    "body": "v0.6.5 — Fresh compiled build containing: python worker server crash protection, 3-attempt client-side image upload retries, RunPod volumeMountPath, and automatic Docker GHCR image build.",
    "draft": False,
    "prerelease": False
}

release_id = None
try:
    print(f"Creating GitHub release {tag}...")
    res = request_json(release_url, headers=github_headers, method='POST', data=release_data)
    release_id = res.get('id')
    print(f"Created release ID: {release_id}")
except Exception as e:
    print(f"Release creation failed (probably already exists), fetching existing release...")
    try:
        tag_url = f"https://api.github.com/repos/{repo}/releases/tags/{tag}"
        res = request_json(tag_url, headers=github_headers)
        release_id = res.get('id')
        print(f"Found existing release ID: {release_id}")
    except Exception as ex:
        print(f"Error fetching release: {ex}")
        sys.exit(1)

if not release_id:
    print("Error: Could not retrieve release ID.")
    sys.exit(1)

# 4. Upload Assets to GitHub Release
# First, fetch existing assets to delete duplicates
assets_url = f"https://api.github.com/repos/{repo}/releases/{release_id}/assets"
existing_assets = request_json(assets_url, headers=github_headers)
asset_map = {a['name']: a['id'] for a in existing_assets if 'name' in a}

for asset_path in release_assets:
    fname = os.path.basename(asset_path)
    if fname in asset_map:
        print(f"Asset {fname} already exists on release, deleting old asset...")
        delete_url = f"https://api.github.com/repos/{repo}/releases/assets/{asset_map[fname]}"
        req_del = urllib.request.Request(delete_url, headers=github_headers, method='DELETE')
        try:
            with urllib.request.urlopen(req_del) as res:
                print(f"Deleted old asset {fname}")
        except Exception as e:
            print(f"Failed to delete old asset {fname}: {e}")

    quoted_name = urllib.parse.quote(fname)
    upload_url = f"https://uploads.github.com/repos/{repo}/releases/{release_id}/assets?name={quoted_name}"
    print(f"Uploading {fname} to GitHub Release {tag}...")
    
    with open(asset_path, 'rb') as f:
        file_data = f.read()
        
    req = urllib.request.Request(upload_url, headers={
        'Authorization': f'token {github_token}',
        'Content-Type': 'application/octet-stream',
        'User-Agent': 'loratrainer-release-agent'
    }, method='POST', data=file_data)
    
    try:
        with urllib.request.urlopen(req) as res:
            print(f"Successfully uploaded {fname}!")
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        print(f"Failed to upload {fname}: {body}", file=sys.stderr)
        sys.exit(1)

print("Release process completed successfully!")
