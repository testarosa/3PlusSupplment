import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import Login from './components/Login'
import Dashboard from './Dashboard'

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [user, setUser] = useState(null)

  return (
    <>
      {loggedIn ? (
        <Dashboard onLogout={() => {
          setLoggedIn(false)
          setUser(null)
        }} user={user} />
      ) : (
        <Login onSuccess={(userInfo) => {
          // Accept optional user info returned from Login
          if (userInfo) setUser(userInfo)
          setLoggedIn(true)
        }} />
      )}
    </>
  )
}

export default App
