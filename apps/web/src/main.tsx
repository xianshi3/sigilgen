import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { I18nProvider } from './i18n/I18nProvider'
import './styles/tokens.css'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('index.html is missing its #root element')
}

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>
)
