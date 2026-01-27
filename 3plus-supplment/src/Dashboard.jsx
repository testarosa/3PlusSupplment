import React, { useState, useEffect } from 'react'
import './Dashboard.css'
import EditInvoiceTemplate from './EditInvoiceTemplate'
import Header from './components/Header'
import Side from './components/Side'
import { NavLink, useNavigate, useLocation, useParams } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { selectAuth } from './store/slices/authSlice'
import { selectCurrentTemplate, setCurrentTemplate, clearCurrentTemplate } from './store/slices/templateSlice'
import { fetchInvoiceTemplateById } from './api/invoiceTemplates'

function Dashboard({ onLogout, user: propUser, embedLayout = false }) {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useDispatch()
  const auth = useSelector(selectAuth)
  const user = auth?.user ?? propUser
  const displayName =
    user?.userName ??
    user?.username ??
    user?.name ??
    user?.userId ??
    user?.F_UserName ??
    'User'

  const EditWrapper = () => {
    const { id } = useParams()
    const currentTemplate = useSelector(selectCurrentTemplate)
    const [loadingTemplate, setLoadingTemplate] = useState(false)
    const [templateError, setTemplateError] = useState(null)

    useEffect(() => {
      let active = true
      const targetId = id

      if (!targetId || targetId === 'new') {
        dispatch(clearCurrentTemplate())
        setTemplateError(null)
        return () => { active = false }
      }

      if (currentTemplate && String(currentTemplate.id) === String(targetId)) {
        return () => { active = false }
      }

      setLoadingTemplate(true)
      setTemplateError(null)
      fetchInvoiceTemplateById(targetId)
        .then((data) => { if (!active) return; dispatch(setCurrentTemplate(data)) })
        .catch((err) => { if (!active) return; setTemplateError(err?.message || 'Failed to load template') })
        .finally(() => { if (active) setLoadingTemplate(false) })

      return () => { active = false }
    }, [id, currentTemplate, dispatch])

    if (loadingTemplate && !currentTemplate) {
      return <div>Loading template...</div>
    }

    if (templateError) {
      return <div className="error-row">{templateError}</div>
    }

    return (
      <EditInvoiceTemplate
        template={currentTemplate ?? {}}
        onSave={(tpl) => { console.log('Updated template', tpl); alert('Saved (demo)'); navigate('/templates') }}
        onCancel={() => navigate('/templates')}
      />
    )
  }

  const content = (
    <div className="content-column dashboard-embed-column">
      <Side location={location} navigate={navigate} EditWrapper={EditWrapper} />
    </div>
  )

  if (embedLayout) {
    return content
  }

  return (
    <div className="dashboard-root">
      <Header displayName={displayName} onLogout={onLogout} />
      <div className="dashboard-layout">

        <main className="dashboard-main">
          {content}
        </main>
      </div>
    </div>
  )
}

export default Dashboard
