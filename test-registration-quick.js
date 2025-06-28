const axios = require('axios');

async function testRegistration() {
  try {
    const testUser = {
      email: `quicktest-${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Quick Test User',
      age: 25,
      gender: 'other',
      dateOfBirth: '1998-01-01',
      location: {
        coordinates: [-122.4194, 37.7749],
        city: 'San Francisco',
        state: 'CA',
        country: 'US'
      }
    };

    console.log('Testing registration...');
    const response = await axios.post('https://onetime-backend.onrender.com/api/auth/register', testUser);
    
    console.log('Registration Response:');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success && response.data.data.userId) {
      console.log('✅ Registration test passed!');
      
      // Test login
      console.log('\nTesting login...');
      const loginResponse = await axios.post('https://onetime-backend.onrender.com/api/auth/login', {
        email: testUser.email,
        password: testUser.password
      });
      
      console.log('Login Response:');
      console.log('Status:', loginResponse.status);
      console.log('Data:', JSON.stringify(loginResponse.data, null, 2));
      
      if (loginResponse.data.success && loginResponse.data.data.accessToken) {
        console.log('✅ Login test passed!');
        
        // Test token validation
        console.log('\nTesting token validation...');
        const meResponse = await axios.get('https://onetime-backend.onrender.com/api/users/me', {
          headers: { Authorization: `Bearer ${loginResponse.data.data.accessToken}` }
        });
        
        console.log('Me Response:');
        console.log('Status:', meResponse.status);
        console.log('Data:', JSON.stringify(meResponse.data, null, 2));
        
        if (meResponse.data.success) {
          console.log('✅ Token validation test passed!');
          console.log('\n🎉 All authentication tests passed!');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

testRegistration();