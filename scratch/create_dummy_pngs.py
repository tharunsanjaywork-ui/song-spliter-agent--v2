import os

setup_images_dir = r"c:\Users\kathir\Desktop\tharun important files\song_splitter\public\setup-images"
os.makedirs(setup_images_dir, exist_ok=True)

# Minimal 1x1 PNG file content (binary)
dummy_png_data = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789ccb60606060000000050001a5f3df4d0000000049454e44ae426082"
)

filenames = [
    "openrouter_step1.png",
    "openrouter_step3.png",
    "openrouter_step4.png",
    "openrouter_step5.png",
    "acr_step1.png",
    "acr_step2.png",
    "acr_step3.png",
    "acr_step4.png",
    "acr_step5.png",
    "acr_step6.png",
    "acr_step7.png",
    "acr_step8.png",
    "acr_step9.png",
]

for filename in filenames:
    path = os.path.join(setup_images_dir, filename)
    with open(path, "wb") as f:
        f.write(dummy_png_data)
    print(f"Created {filename}")
