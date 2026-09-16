# Test Cases for TENDER
Building test cases for TENDER involves creating a suite of tests that validate the functionality of both the frontend and backend components. Here’s a structured approach to building test cases for TENDER:

You must prove each of the test cases work and build the files necessary to run them. Below is a detailed outline of the test cases for the backend, focusing on the API endpoints and their expected behaviors.

### 1. Backend Test Cases
1. **Test Case: Valid Message Submission**
   - **Objective:** Ensure that a valid message is processed correctly by the backend.
   - **Input:** A valid JSON payload with a message string.
   - **Expected Output:** A successful response with a generated response from the model.
   - **Steps:**
     1. Send a POST request to `/api/chat` with a valid message.
     2. Verify that the response status code is 200.
     3. Check that the response body contains a non-empty `response` field.

2. **Test Case: Invalid Message Submission**
   - **Objective:** Ensure that an invalid message (e.g., empty string, non-string) is handled correctly.
   - **Input:** A JSON payload with an empty string or non-string value.  

3. **Expected Output:** An error response indicating the invalid input.
   - **Steps:**
     1. Send a POST request to `/api/chat` with an invalid message.
     2. Verify that the response status code is 400.
     3. Check that the response body contains an `error` field with a descriptive message. 

4. **Test Case: Ollama Service Unavailable**
   - **Objective:** Ensure that the backend handles the scenario where the Ollama service is down.
   - **Input:** A valid message submission while the Ollama service is unavailable.
   - **Expected Output:** A 502 Bad Gateway response indicating that the service is unreachable.
   - **Steps:**
     1. Simulate the Ollama service being down (e.g., by stopping the service).
     2. Send a POST request to `/api/chat` with a valid message.
     3. Verify that the response status code is 502.
     4. Check that the response body contains an `error` field indicating the service is unreachable.

### 2. Frontend Test Cases

1. **Test Case: Input Field Validation**
   - **Objective:** Ensure that the input field on the frontend validates user input correctly.
   - **Input:** User attempts to submit an empty message or a non-string value.
   - **Expected Output:** The frontend should prevent submission and display an error message.
   - **Steps:**
     1. Attempt to submit an empty message in the input field.
     2. Verify that the submit button is disabled or an error message is displayed.
     3. Attempt to submit a non-string value (e.g., a number).
     4. Verify that the submit button is disabled or an error message is displayed.


# Implementing a non-Ollama backend for testing purposes
To facilitate testing without relying on the Ollama service, we can implement a mock backend that simulates the behavior of the Ollama service. This mock backend will allow us to test the API endpoints and frontend interactions without needing the actual Ollama service to be running.