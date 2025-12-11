import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  items: [],
  currentTemplate: null,
  loading: false,
  error: null,
}

export const templateSlice = createSlice({
  name: 'templates',
  initialState,
  reducers: {
    addTemplate: (state, action) => {
      state.items.push(action.payload)
    },
    updateTemplate: (state, action) => {
      const index = state.items.findIndex(item => item.id === action.payload.id)
      if (index !== -1) {
        state.items[index] = action.payload
      }
    },
    deleteTemplate: (state, action) => {
      state.items = state.items.filter(item => item.id !== action.payload)
    },
    setCurrentTemplate: (state, action) => {
      state.currentTemplate = action.payload
    },
    clearCurrentTemplate: (state) => {
      state.currentTemplate = null
    },
    setTemplates: (state, action) => {
      state.items = action.payload
    },
    setLoading: (state, action) => {
      state.loading = action.payload
    },
    setError: (state, action) => {
      state.error = action.payload
    },
  },
})

export const { 
  addTemplate, 
  updateTemplate, 
  deleteTemplate, 
  setCurrentTemplate, 
  clearCurrentTemplate,
  setTemplates,
  setLoading,
  setError
} = templateSlice.actions

// Selectors
export const selectAllTemplates = (state) => state.templates.items
export const selectCurrentTemplate = (state) => state.templates.currentTemplate
export const selectTemplateById = (state, id) => 
  state.templates.items.find(item => item.id === id)
export const selectLoading = (state) => state.templates.loading
export const selectError = (state) => state.templates.error

export default templateSlice.reducer
