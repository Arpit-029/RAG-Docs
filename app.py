import os
from dotenv import load_dotenv
import streamlit as st
import fitz
import chromadb
from sentence_transformers import SentenceTransformer
from groq import Groq
load_dotenv()

# INITIALIZE 
@st.cache_resource
def load_models():
    embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    chroma_client = chromadb.PersistentClient(path="./chroma_db")
    return embedding_model, groq_client, chroma_client

embedding_model, groq_client, chroma_client = load_models()


st.title(" Chat with your PDF")

#  PDF UPLOAD 
uploaded_file = st.file_uploader("Upload a PDF", type="pdf")

if uploaded_file is not None:
    
    if "processed_file" not in st.session_state or st.session_state.processed_file != uploaded_file.name:

        with st.spinner("Reading and indexing your PDF..."):

           
            pdf_bytes = uploaded_file.read()
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")

          
            full_text = ""
            for page in doc:
                full_text += page.get_text()

           
            words = full_text.split()
            chunks = []
            current_chunk = []
            for word in words:
                current_chunk.append(word)
                if len(current_chunk) >= 500:
                    chunks.append(" ".join(current_chunk))
                    current_chunk = []
            if current_chunk:
                chunks.append(" ".join(current_chunk))

            # store in ChromaDB
            try:
                chroma_client.delete_collection(name="my_documents")
            except:
                pass
            collection = chroma_client.create_collection(name="my_documents")

            for i, chunk in enumerate(chunks):
                embedding = embedding_model.encode(chunk).tolist()
                collection.add(
                    ids=[f"chunk_{i}"],
                    embeddings=[embedding],
                    documents=[chunk]
                )

            st.session_state.processed_file = uploaded_file.name
            st.session_state.collection = collection

        st.success(f" Ready! {len(chunks)} chunks indexed from your PDF")

    else:
        # file already processed, just load collection
        st.session_state.collection = chroma_client.get_collection(name="my_documents")
        st.success(f" {uploaded_file.name} already indexed!")


        #CHAT INTERFACE 
if "messages" not in st.session_state:
    st.session_state.messages = []

#chat history
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.write(message["content"])

# chat input
question = st.chat_input("Ask something about your PDF...")

if question and "collection" in st.session_state:
    # add user message to history
    st.session_state.messages.append({"role": "user", "content": question})
    with st.chat_message("user"):
        st.write(question)

    # get answer
    with st.chat_message("assistant"):
        with st.spinner("Thinking..."):

          
            question_embedding = embedding_model.encode(question).tolist()

           
            results = st.session_state.collection.query(
                query_embeddings=[question_embedding],
                n_results=3
            )
            context = "\n\n".join(results["documents"][0])

            prompt = f"""You are PDF Brain, an intelligent document assistant.
Your job is to answer questions strictly based on the provided document context.
Be concise, clear and friendly. If the answer is not in the context, 
say "I couldn't find that in the document" — never make things up.

Context:
{context}

Question:
{question}

Answer:"""
            response = groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "user", "content": prompt}]
            )

            answer = response.choices[0].message.content
            st.write(answer)

    st.session_state.messages.append({"role": "assistant", "content": answer})

elif question and "collection" not in st.session_state:
    st.warning(" Please upload a PDF first!")


with st.sidebar:
    if st.button(" Clear chat history"):
        st.session_state.messages = []
        st.rerun()
    