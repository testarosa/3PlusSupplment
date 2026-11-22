import { useId, useRef, useState } from 'react'
import { PortalIcon } from './PortalNav'
import './DocumentDropzone.css'

const fileTypes = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
const acceptedTypes = [...new Set(Object.values(fileTypes))]
const accept = [...acceptedTypes, '.pdf', '.png', '.jpg', '.jpeg'].join(',')
const maxBytes = 10 * 1024 * 1024

function includesFiles(event) {
  return Array.from(event.dataTransfer.types).includes('Files')
}

export default function DocumentDropzone({ label, file, onChange, disabled, disabledHint }) {
  const input = useRef(null)
  const dragDepth = useRef(0)
  const hintId = useId()
  const [dragging, setDragging] = useState(false)

  function selectFiles(files) {
    if (disabled || !files?.length) return
    if (files.length !== 1) {
      onChange(null, 'Choose one file at a time.')
      return
    }
    const selected = files[0]
    const extension = selected.name.match(/\.([a-z]+)$/i)?.[1].toLowerCase()
    const type = selected.type || fileTypes[extension]
    if (!acceptedTypes.includes(type) || !selected.size || selected.size > maxBytes) {
      onChange(null, 'Choose a nonempty PDF, PNG, or JPEG file of 10 MB or less.')
      return
    }
    onChange(selected.type ? selected : new File([selected], selected.name, { type, lastModified: selected.lastModified }))
  }

  function endDrag() {
    dragDepth.current = 0
    setDragging(false)
  }

  return (
    <div className="document-dropzone" role="group" aria-label={label}
      data-dragging={dragging && !disabled} data-disabled={disabled}
      onDragEnter={(event) => {
        if (!includesFiles(event)) return
        event.preventDefault()
        if (!disabled) {
          dragDepth.current++
          setDragging(true)
        }
      }}
      onDragOver={(event) => {
        if (!includesFiles(event)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = disabled ? 'none' : 'copy'
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (!dragDepth.current) setDragging(false)
      }}
      onDrop={(event) => {
        if (!includesFiles(event) && !event.dataTransfer.files.length) return
        event.preventDefault()
        endDrag()
        selectFiles(event.dataTransfer.files)
      }}>
      <span className="document-dropzone-icon" aria-hidden="true"><PortalIcon name="upload" /></span>
      <div className="document-dropzone-copy">
        <strong>{dragging && !disabled ? 'Drop to select' : 'Drag and drop a file here'}</strong>
        <p id={hintId}>{disabledHint || 'PDF, PNG, or JPEG up to 10 MB'}</p>
      </div>
      <input ref={input} type="file" accept={accept} aria-label={label} hidden disabled={disabled} onChange={(event) => {
        selectFiles(event.target.files)
        event.target.value = ''
      }} />
      <button className="btn outline document-dropzone-choose" type="button" disabled={disabled}
        aria-describedby={hintId} onClick={() => input.current?.click()}>
        {file ? 'Replace file' : 'Choose file'}
      </button>
      {file && (
        <div className="document-dropzone-file">
          <span role="status"><strong>{file.name}</strong></span>
          <button className="btn ghost" type="button" disabled={disabled} onClick={() => onChange(null)}>Remove file</button>
        </div>
      )}
    </div>
  )
}
