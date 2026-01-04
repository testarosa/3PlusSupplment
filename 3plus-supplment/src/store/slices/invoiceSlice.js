import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  items: [],
  currentInvoice: null,
  loading: false,
  error: null,
}

export const invoiceSlice = createSlice({
  name: 'invoices',
  initialState,
  reducers: {
    addInvoice: (state, action) => {
      state.items.push(action.payload)
    },
    updateInvoice: (state, action) => {
      const index = state.items.findIndex(item => item.id === action.payload.id)
      if (index !== -1) {
        state.items[index] = action.payload
      }
    },
    deleteInvoice: (state, action) => {
      state.items = state.items.filter(item => item.id !== action.payload)
    },
    setCurrentInvoice: (state, action) => {
      state.currentInvoice = action.payload
    },
    clearCurrentInvoice: (state) => {
      state.currentInvoice = null
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
  addInvoice, 
  updateInvoice, 
  deleteInvoice, 
  setCurrentInvoice, 
  clearCurrentInvoice,
  setLoading,
  setError
} = invoiceSlice.actions

// Selectors
export const selectAllInvoices = (state) => state.invoices.items
export const selectCurrentInvoice = (state) => state.invoices.currentInvoice
export const selectInvoiceById = (state, id) => 
  state.invoices.items.find(item => item.id === id)
export const selectLoading = (state) => state.invoices.loading
export const selectError = (state) => state.invoices.error

export default invoiceSlice.reducer
