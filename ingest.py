import fitz
import chromadb
from sentence_transformers import SentenceTransformer

#  EXTRACT TEXT FROM PDF
print("Opening PDF...")
doc = fitz.open("ec.pdf")

full_text = ""
for page in doc:
    full_text += page.get_text()

print(f"Extracted {len(full_text)} characters from {len(doc)} pages")
 
#  SPLIT TEXT INTO CHUNKS 
def split_into_chunks(text, chunk_size=500):
    words = text.split()       
    chunks = []                
    current_chunk = []         

    for word in words:
        current_chunk.append(word)

        if len(current_chunk) >= chunk_size:
            chunks.append(" ".join(current_chunk))
            current_chunk = []

    #  leftover words as last chunk
    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return chunks

chunks = split_into_chunks(full_text)
print(f"Created {len(chunks)} chunks")


print("\nLoading embedding model...")

embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

print("Model loaded!")

# STORE IN CHROMADB 
print("\nConnecting to ChromaDB...")

chroma_client = chromadb.PersistentClient(path="./chroma_db")

# delete old collection if exists
try:
    chroma_client.delete_collection(name="my_documents")
    print("Cleared old data")
except:
    pass

collection = chroma_client.create_collection(name="my_documents")

print("Storing chunks...")
for i, chunk in enumerate(chunks):
    embedding = embedding_model.encode(chunk).tolist()
    collection.add(
        ids=[f"chunk_{i}"],
        embeddings=[embedding],
        documents=[chunk]
    )
    print(f"Stored chunk {i+1}/{len(chunks)}", end="\r")

print(f"\nDone! {len(chunks)} chunks stored!")
print("You can now run chat.py to ask questions!")