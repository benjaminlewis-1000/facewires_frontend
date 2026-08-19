import axiosInstance from './axios_setup';

const isLoggedIn = async () => {
  console.log("--- STARTING SSO AUTH CHECK ---");
  try {
    const response = await axiosInstance.get('/parameters/');
    
    console.log("Axios request succeeded!");
    console.log("Status Code:", response.status);
    console.log("Headers object:", response.headers);
    console.log("Content-Type header:", response.headers['content-type']);
    console.log("First 100 chars of data payload:", String(JSON.stringify(response.data)).substring(0, 100));

    const contentType = response.headers['content-type'] || '';
    if (contentType.includes('text/html')) {
      console.log("Result: Found HTML! Returning FALSE (logged out)");
      return false;
    }
    
    console.log("Result: Clean JSON payload! Returning TRUE (logged in)");
    return true; 
  } catch (error) {
    console.log("Axios request hit the CATCH block!");
    if (error.response) {
      console.log("Server responded with error status:", error.response.status);
      console.log("Error response headers:", error.response.headers);
    } else if (error.request) {
      console.log("No response received. The network request was made but timed out or dropped.");
    } else {
      console.log("Error setting up the request:", error.message);
    }
    return false;
  }
};

export default isLoggedIn;