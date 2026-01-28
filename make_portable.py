import base64
import os
import re

html_path = r'c:\Users\furka\.gemini\antigravity\playground\ruby-kuiper\Furkan_itps_supportive_app.html'
brain_dir = r'C:\Users\furka\.gemini\antigravity\brain\785419bb-c8c5-4c23-af2f-5bd1fea4de34'

images = {
    'overcast_clouds_hq_1769542940706.png': 'b64_overcast',
    'broken_clouds_hq_1769542926083.png': 'b64_broken',
    'scattered_clouds_hq_1769542909536.png': 'b64_scattered',
    'few_clouds_hq_1769542896192.png': 'b64_few',
    'fog_ovx_hq_1769542956467.png': 'b64_fog'
}

with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update Stations
# Replace CYQG with CYQS and add CYTB
# original: const stationsList = ['CYXU', 'CYYZ', 'CYHM', 'CYKF', 'CYQG', 'CYTZ'];
content = content.replace("'CYQG'", "'CYQS'")
if "'CYTB'" not in content:
    content = content.replace("'CYTZ']", "'CYTZ', 'CYTB']")

# 2. Embed Images
for img_name, key in images.items():
    img_path = os.path.join(brain_dir, img_name)
    if os.path.exists(img_path):
        with open(img_path, 'rb') as img_file:
            b64_data = base64.b64encode(img_file.read()).decode('utf-8')
            data_uri = f'data:image/png;base64,{b64_data}'
            # Escape backslashes for the regex replacement if needed, but since we are doing simple replace:
            search_str = f'file:///{img_path.replace("\\", "/")}'
            content = content.replace(search_str, data_uri)
            # Fallback for double check
            content = content.replace(img_path, data_uri)
            print(f"Embedded {img_name}")
    else:
        print(f"Warning: {img_name} not found at {img_path}")

with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("HTML update complete.")
