const DATABASE_NAME = "aeos-documents"
const DATABASE_VERSION = 1
const STORE_NAME = "documents"
const ACTIVE_DOCUMENT_KEY = "active"

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runRequest(database, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = action(transaction.objectStore(STORE_NAME))
    let result

    request.onsuccess = () => { result = request.result }
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error || request.error)
    transaction.onabort = () => reject(transaction.error || request.error)
  }).finally(() => database.close())
}

export async function loadActiveDocument() {
  const database = await openDatabase()
  const document = await runRequest(database, "readonly", store => store.get(ACTIVE_DOCUMENT_KEY))

  if (
    !document ||
    typeof document.name !== "string" ||
    !Array.isArray(document.chunks) ||
    !Number.isFinite(document.pages) ||
    typeof document.summary !== "string"
  ) return null

  return document
}

export async function saveActiveDocument(document) {
  const database = await openDatabase()
  await runRequest(database, "readwrite", store => store.put(document, ACTIVE_DOCUMENT_KEY))
}
