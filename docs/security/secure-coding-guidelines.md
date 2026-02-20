# Secure Coding Guidelines for VectoBeat

## Overview
This document outlines security best practices and guidelines for developing secure code in the VectoBeat project. These guidelines help prevent common security vulnerabilities and ensure compliance with industry standards.

## XSS Prevention

### React/Frontend Security
- **Never use `dangerouslySetInnerHTML`** without proper sanitization
- **Always sanitize user input** before rendering
- **Use DOMPurify** for HTML content sanitization
- **Validate all props** passed to components
- **Implement Content Security Policy (CSP)** headers

### Safe Implementation Example
```tsx
import DOMPurify from 'isomorphic-dompurify';

// Sanitize HTML content before rendering
const sanitizedContent = DOMPurify.sanitize(userInput, {
  ALLOWED_TAGS: ['p', 'strong', 'em', 'h1', 'h2', 'h3'],
  ALLOWED_ATTR: ['class', 'id']
});

<div dangerouslySetInnerHTML={{ __html: sanitizedContent }} />
```

### Content Security Policy
```typescript
// Implement CSP headers
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://analytics.example.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: https:;
  font-src 'self';
  connect-src 'self' https://api.example.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
`;
```

## SQL Injection Prevention

### Database Query Security
- **Always use parameterized queries**
- **Never concatenate user input** into SQL strings
- **Use ORM protections** (Prisma provides built-in protection)
- **Validate all input** before database operations
- **Implement least privilege** database access

### Prisma Security Best Practices
```typescript
// ✅ Safe - Prisma parameterizes automatically
const user = await prisma.user.findUnique({
  where: { email: userEmail }
});

// ❌ Dangerous - Raw SQL without parameters
const users = await prisma.$queryRaw(
  `SELECT * FROM users WHERE email = ${userEmail}`
);

// ✅ Safe - Raw SQL with parameters
const users = await prisma.$queryRaw(
  `SELECT * FROM users WHERE email = $1`,
  userEmail
);
```

## Authentication & Authorization

### Session Management
- **Use secure session tokens** (JWT with proper signing)
- **Implement session timeout** mechanisms
- **Store sessions securely** (encrypted, HttpOnly cookies)
- **Validate sessions** on every request
- **Implement concurrent session** limits

### Authorization Patterns
```typescript
// Role-based access control
const hasPermission = (user, resource, action) => {
  return user.roles.some(role => 
    role.permissions.some(permission =>
      permission.resource === resource && 
      permission.action === action
    )
  );
};

// Resource-based authorization
const canAccessResource = (user, resourceId) => {
  return user.ownedResources.includes(resourceId) || 
         user.sharedResources.includes(resourceId);
};
```

## Input Validation

### Validation Strategy
- **Validate on client-side** for UX
- **Always validate on server-side** for security
- **Use schema validation** libraries (Zod, Yup)
- **Sanitize all input** before processing
- **Limit input length** and character sets

### Zod Schema Example
```typescript
import { z } from 'zod';

const userInputSchema = z.object({
  email: z.string().email().max(255),
  username: z.string().alphanumeric().min(3).max(30),
  age: z.number().int().min(13).max(120),
  bio: z.string().max(500).regex(/^[a-zA-Z0-9\s.,!?-]+$/)
});

// Validate input
const result = userInputSchema.safeParse(req.body);
if (!result.success) {
  return res.status(400).json({ errors: result.error.errors });
}
```

## Password Security

### Password Requirements
- **Minimum 12 characters** length
- **Require complexity** (uppercase, lowercase, numbers, symbols)
- **Check against common passwords**
- **Implement password history** to prevent reuse
- **Use bcrypt or Argon2** for hashing

### Secure Password Hashing
```typescript
import bcrypt from 'bcrypt';

// Hash password with high cost factor
const hashPassword = async (password) => {
  const saltRounds = 14; // High cost factor
  return await bcrypt.hash(password, saltRounds);
};

// Verify password
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};
```

## API Security

### Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});
```

### API Key Management
- **Use cryptographically secure** random key generation
- **Store keys hashed** in database (like passwords)
- **Implement key rotation** mechanisms
- **Monitor API usage** for anomalies
- **Implement key expiration**

### Secure Headers
```typescript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});
```

## Error Handling

### Secure Error Messages
```typescript
// ❌ Don't expose internal details
catch (error) {
  res.status(500).json({
    error: `Database connection failed: ${error.sqlMessage}`
  });
}

// ✅ Use generic error messages
catch (error) {
  logger.error('Database error', error);
  res.status(500).json({
    error: 'An internal error occurred. Please try again later.'
  });
}
```

### Error Logging
- **Log security events** (failed logins, suspicious activity)
- **Never log sensitive data** (passwords, tokens, PII)
- **Use structured logging** for better analysis
- **Implement log rotation** and retention policies

## Dependency Security

### Package Management
- **Regularly update dependencies** for security patches
- **Use npm audit** to check for vulnerabilities
- **Pin dependency versions** for reproducible builds
- **Review dependency licenses** for compliance

### Security Scanning
```bash
# Check for vulnerabilities
npm audit

# Fix automatically fixable issues
npm audit fix

# Check for high-severity issues
npm audit --audit-level high
```

## Environment Security

### Configuration Management
- **Never hardcode secrets** in source code
- **Use environment variables** for configuration
- **Implement secret rotation** procedures
- **Use different secrets** for different environments
- **Encrypt sensitive configuration** data

### Secure Defaults
```typescript
// ❌ Insecure default
const config = {
  debugMode: true,
  allowCors: true,
  sessionTimeout: 86400
};

// ✅ Secure defaults
const config = {
  debugMode: false,
  allowCors: false,
  sessionTimeout: 1800, // 30 minutes
  requireHttps: true,
  csrfProtection: true
};
```

## File Upload Security

### Upload Validation
- **Validate file types** by content, not just extension
- **Limit file size** to prevent DoS attacks
- **Scan uploads** for malware
- **Store uploads** outside web root
- **Use secure file naming** conventions

### File Processing
```typescript
import fileType from 'file-type';
import sharp from 'sharp';

const processUpload = async (file) => {
  // Validate file type by content
  const type = await fileType.fromBuffer(file.buffer);
  if (!['image/jpeg', 'image/png'].includes(type.mime)) {
    throw new Error('Invalid file type');
  }
  
  // Process image to remove metadata and resize
  const processed = await sharp(file.buffer)
    .resize(1024, 1024, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer();
    
  return processed;
};
```

## Cryptography

### Encryption Standards
- **Use AES-256** for symmetric encryption
- **Use RSA-4096** for asymmetric encryption
- **Use SHA-256** or better for hashing
- **Implement proper key management**
- **Use established libraries** (never roll your own crypto)

### Secure Random Generation
```typescript
import crypto from 'crypto';

// Generate secure random tokens
const generateToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Generate secure random numbers
const secureRandom = (min, max) => {
  const range = max - min;
  const randomBytes = crypto.randomBytes(4);
  const randomInt = randomBytes.readUInt32BE(0);
  return min + (randomInt % range);
};
```

## Security Testing

### Automated Security Testing
- **Integrate SAST tools** in CI/CD pipeline
- **Run dependency scans** regularly
- **Perform DAST testing** on staging environments
- **Implement security unit tests**

### Manual Security Testing
- **Regular penetration testing**
- **Code security reviews**
- **Architecture security assessments**
- **Third-party security audits**

## Incident Response

### Security Incident Procedure
1. **Detect and assess** the incident
2. **Contain** the threat to prevent spread
3. **Investigate** the root cause
4. **Remediate** the vulnerability
5. **Recover** affected systems
6. **Document** lessons learned
7. **Improve** security measures

### Communication Plan
- **Internal notification** procedures
- **Customer communication** protocols
- **Regulatory reporting** requirements
- **Public disclosure** guidelines

## Compliance

### Regulatory Requirements
- **GDPR**: Data protection and privacy
- **CCPA**: California consumer privacy
- **SOX**: Financial reporting security
- **HIPAA**: Healthcare data protection
- **PCI DSS**: Payment card security

### Industry Standards
- **ISO 27001**: Information security management
- **SOC 2**: Service organization controls
- **NIST**: Cybersecurity framework
- **OWASP**: Application security standards

## Security Training

### Developer Training
- **Secure coding practices**
- **Common vulnerability awareness**
- **Security testing techniques**
- **Incident response procedures**

### Regular Updates
- **Stay informed** about new vulnerabilities
- **Attend security conferences** and training
- **Participate in security communities**
- **Practice with security challenges**

## Resources

### Security Tools
- **SAST**: SonarQube, ESLint Security Plugin
- **DAST**: OWASP ZAP, Burp Suite
- **Dependency Scanning**: npm audit, Snyk
- **Container Scanning**: Clair, Twistlock

### Security References
- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **SANS Top 25**: https://www.sans.org/top25-software-errors/
- **CWE Database**: https://cwe.mitre.org/
- **CVE Database**: https://cve.mitre.org/

### Security Communities
- **OWASP**: Open Web Application Security Project
- **SANS**: SysAdmin, Audit, Network, and Security
- **Security Stack Exchange**: Q&A community
- **Reddit Security Communities**: r/netsec, r/security