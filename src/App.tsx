import { AppRouter } from './router/AppRouter'
import { PWAInstallPrompt } from './components/PWAInstallPrompt'

function App() {
  return (
    <>
      <AppRouter />
      {/* Rendered outside IdentityGate/Routes on purpose: install eligibility
          has nothing to do with auth state, and this is a non-blocking
          bottom banner (see component) so it never competes with the
          Role Selection / Terms / Login taps underneath it. */}
      <PWAInstallPrompt />
    </>
  )
}

export default App