import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  items: [
    { id: '#1001', customer: 'ABC Co.', ref: 'REF-1001', invoiceNumber: 'INV-1001', postDate: '2025-10-01', invoiceDate: '2025-10-02', dueDate: '2025-11-01', amount: 1200.0, status: 'Paid' },
    { id: '#1002', customer: 'XYZ Ltd.', ref: 'REF-2002', invoiceNumber: 'INV-2002', postDate: '2025-10-15', invoiceDate: '2025-10-16', dueDate: '2025-11-15', amount: 420.0, status: 'Due' },
    { id: '#1003', customer: 'Acme Inc.', ref: 'REF-3003', invoiceNumber: 'INV-3003', postDate: '2025-09-20', invoiceDate: '2025-09-21', dueDate: '2025-10-21', amount: 980.0, status: 'Due' }
  ],
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
