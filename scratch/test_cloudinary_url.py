import os
import sys
import cloudinary
import cloudinary.uploader
import dotenv

# Load environment variables
dotenv.load_dotenv(os.path.join(os.path.dirname(__file__), "..", "backend", ".env"))

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
)

LOCAL_FILE = r"C:\Users\kathir\Desktop\tharun important files\song_splitter\sample song\song3.mp3"

def main():
    if not os.path.exists(LOCAL_FILE):
        print(f"Local test file not found: {LOCAL_FILE}")
        return
        
    print("Testing upload WITHOUT extension in public_id...")
    public_id_no_ext = "audiowave_test/test_song_no_ext"
    try:
        res1 = cloudinary.uploader.upload(
            LOCAL_FILE,
            resource_type="video",
            public_id=public_id_no_ext,
            overwrite=True
        )
        print("Upload success!")
        print("secure_url returned:", res1.get("secure_url"))
        print("public_id returned:", res1.get("public_id"))
        print("format returned:", res1.get("format"))
    except Exception as e:
        print("Upload failed:", e)
        
    print("\n" + "="*40 + "\n")
    
    print("Testing upload WITH extension in public_id...")
    public_id_with_ext = "audiowave_test/test_song_with_ext.mp3"
    try:
        res2 = cloudinary.uploader.upload(
            LOCAL_FILE,
            resource_type="video",
            public_id=public_id_with_ext,
            overwrite=True
        )
        print("Upload success!")
        print("secure_url returned:", res2.get("secure_url"))
        print("public_id returned:", res2.get("public_id"))
        print("format returned:", res2.get("format"))
    except Exception as e:
        print("Upload failed:", e)

if __name__ == "__main__":
    main()
