import os
import json
import http.server
import urllib.parse
import base64
import subprocess
import sys

PORT = 8000
DATASET_DIR = "/workspace/dataset"
CONFIG_DIR = "/workspace/config"
OUTPUT_DIR = "/workspace/output"

os.makedirs(DATASET_DIR, exist_ok=True)
os.makedirs(CONFIG_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

start_training = False

class WorkerHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        global start_training
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        if path == '/upload':
            try:
                data = json.loads(post_data.decode('utf-8'))
                filename = data.get('filename')
                image_b64 = data.get('image_b64')
                caption = data.get('caption', '')
                
                img_data = base64.b64decode(image_b64)
                img_path = os.path.join(DATASET_DIR, filename)
                with open(img_path, 'wb') as f:
                    f.write(img_data)
                
                base_name = os.path.splitext(filename)[0]
                cap_path = os.path.join(DATASET_DIR, base_name + '.txt')
                with open(cap_path, 'w', encoding='utf-8') as f:
                    f.write(caption)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode())
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
                
        elif path == '/start':
            try:
                data = json.loads(post_data.decode('utf-8'))
                config_yaml = data.get('config_yaml')
                with open(os.path.join(CONFIG_DIR, 'train.yaml'), 'w', encoding='utf-8') as f:
                    f.write(config_yaml)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"success": True}).encode())
                start_training = True
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(str(e).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        # Serve files from output directory
        file_path = os.path.join(OUTPUT_DIR, path.lstrip('/'))
        if os.path.exists(file_path) and os.path.isfile(file_path):
            self.send_response(200)
            self.send_header('Content-Type', 'application/octet-stream')
            self.end_headers()
            with open(file_path, 'rb') as f:
                self.wfile.write(f.read())
        else:
            self.send_response(404)
            self.end_headers()

def run_server():
    server = http.server.HTTPServer(('', PORT), WorkerHandler)
    print(f"Worker server listening on port {PORT}...")
    while not start_training:
        try:
            server.handle_request()
        except Exception as e:
            print(f"Server request handling error: {e}", file=sys.stderr)
    print("Received start signal. Closing upload server and beginning training...")
    server.server_close()

if __name__ == '__main__':
    run_server()
