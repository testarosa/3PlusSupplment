import { configureStore } from '@reduxjs/toolkit'
import invoiceReducer from './slices/invoiceSlice'
import templateReducer from './slices/templateSlice'
import authReducer from './slices/authSlice'

export const store = configureStore({
  reducer: {
    invoices: invoiceReducer,
    templates: templateReducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types for date serialization
        ignoredActions: ['invoices/setInvoice', 'invoices/updateInvoice'],
        // Ignore these paths in the state for date serialization
        ignoredPaths: ['invoices.items', 'invoices.currentInvoice', 'auth.token', 'auth.user'],
      },
    }),
})
