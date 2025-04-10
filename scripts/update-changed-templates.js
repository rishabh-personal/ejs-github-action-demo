const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const axios = require('axios');

// Helper function to get changed files in the latest commit
function getChangedFiles() {
  try {
    // Get files changed in the latest push to main
    const diffOutput = execSync('git diff --name-only HEAD^ HEAD').toString();
    return diffOutput.split('\n').filter(file => file.endsWith('.ejs'));
  } catch (error) {
    console.error('Error getting changed files:', error);
    return [];
  }
}

// Function to find the config file for an enterprise
function findEnterpriseConfig(ejsFilePath) {
  // Get the directory containing the EJS file
  const ejsDir = path.dirname(ejsFilePath);
  
  // Look for config files in the same directory
  const possibleConfigFiles = [
    path.join(ejsDir, 'config.json'),
    path.join(ejsDir, 'config.js'),
    path.join(ejsDir, 'enterprise.config.json')
  ];
  
  for (const configPath of possibleConfigFiles) {
    if (fs.existsSync(configPath)) {
      if (configPath.endsWith('.json')) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } else if (configPath.endsWith('.js')) {
        // For JS configs, you might need to handle this differently
        // This is a simplified example
        const configContent = fs.readFileSync(configPath, 'utf8');
        // Extract export object from JS using a basic regex approach
        const match = configContent.match(/module\.exports\s*=\s*({[\s\S]*});?$/);
        if (match && match[1]) {
          try {
            return JSON.parse(match[1].replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":'));
          } catch (e) {
            console.error(`Error parsing JS config for ${ejsFilePath}:`, e);
          }
        }
      }
    }
  }
  
  console.warn(`Warning: No config file found for template ${ejsFilePath}`);
  return null;
}

// Function to update a template via API
async function updateTemplate(ejsFilePath, enterpriseConfig) {
  try {
    // Read the template content
    const templateContent = fs.readFileSync(ejsFilePath, 'utf8');
    
    // Get template name from file path (you might want to adjust this logic)
    const templateName = path.basename(ejsFilePath, '.ejs');
    
    // Get enterprise ID from directory name or config
    const enterpriseId = enterpriseConfig.enterpriseId || path.basename(path.dirname(ejsFilePath));
    
    // Prepare the API request
    const apiBaseUrl = enterpriseConfig.baseUrl || process.env.DEFAULT_API_URL;
    if (!apiBaseUrl) {
      throw new Error(`No API base URL found for ${enterpriseId}`);
    }
    
    const apiUrl = `${apiBaseUrl}`;
    const authToken = enterpriseConfig.authToken || process.env.API_KEY;
    
    // Prepare the request payload
    const payload = {
      enterpriseId,
      templateName,
      templateContent,
      // Add any other required fields
    };
    
    // Make the API request
    const response = await axios.post(apiUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    console.log(`Successfully updated template ${templateName} for enterprise ${enterpriseId}`);
    return response.data;
  } catch (error) {
    console.error(`Error updating template ${ejsFilePath}:`, error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    throw error;
  }
}

// Main function
async function main() {
  try {
    // Get all changed EJS files
    const changedFiles = getChangedFiles();
    console.log(`Found ${changedFiles.length} changed EJS templates`);
    
    if (changedFiles.length === 0) {
      console.log('No templates to update');
      return;
    }
    
    // Update each changed template
    for (const file of changedFiles) {
      console.log(`Processing file: ${file}`);
      
      // Find the enterprise config for this template
      const config = findEnterpriseConfig(file);
      
      if (config) {
        await updateTemplate(file, config);
      } else {
        console.error(`Skipping ${file}: No enterprise configuration found`);
      }
    }
    
    console.log('All templates updated successfully');
  } catch (error) {
    console.error('Error in template update process:', error);
    process.exit(1);
  }
}

// Run the script
main();