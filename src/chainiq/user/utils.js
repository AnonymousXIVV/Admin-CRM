
export const formatCurrency = (val, currency = 'USD') => { 
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency }).format(val); 
}
