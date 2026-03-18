from sentence_transformers import SentenceTransformer
import chromadb
from groq import Groq


#  CONNECT TO CHROMADB
chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_collection(name="my_documents")

# LOAD EMBEDDING MODEL
print("Loading embedding model...")
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
print("Ready! Ask me anything about your document.\n")


groq_client = Groq(api_key="enter your api")


#ASK A QUESTION
def ask(question):

    
    question_embedding = embedding_model.encode(question).tolist()


    results = collection.query(
        query_embeddings=[question_embedding],
        n_results=3
    )

    
    context_chunks = results["documents"][0]
    context = "\n\n".join(context_chunks)


    prompt = f"""You are a helpful assistant. 
Use the following context from a document to answer the question.
Only use the context provided. If the answer is not in the context say "I don't know."

Context:
{context}

Question:
{question}

Answer:"""

    #  send to Groq and get answer
    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "user", "content": prompt}
        ]
    )

    return response.choices[0].message.content


# CHAT LOOP 
while True:
    question = input("You: ")
    if question.lower() == "exit":
        print("Bye!")
        break
    answer = ask(question)
    print(f"\nBot: {answer}\n")