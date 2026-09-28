export const isDev = () => {
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'dev';
};
  
export const isProd = () => {
    return process.env.NODE_ENV === "production" || process.env.NODE_ENV === 'prod';
};
  