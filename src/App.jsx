import ApiKeyPage from "./pages/ApiKeyPage"
import DocumentChatPage from "./pages/DocumentChatPage"
import { useDocMind } from "./hooks/useDocMind"

// App only decides which screen is visible. All app state lives in useDocMind.
export default function App() {
  const docMind = useDocMind()

  if (!docMind.apiKey) {
    return <ApiKeyPage keyDraft={docMind.keyDraft} onKeyDraftChange={docMind.setKeyDraft} onSave={docMind.saveKey} />
  }

  return <DocumentChatPage {...docMind} />
}
