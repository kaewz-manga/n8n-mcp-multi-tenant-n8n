# CI Test Infrastructure - Known Issues

## Integration Test Failures for External Contributor PRs

### Issue Summary

Integration tests fail for external contributor PRs with "No response from n8n server" errors, despite the code changes being correct. This is a **test infrastructure issue**, not a code quality issue.

### Root Cause

1. **GitHub Actions Security**: External contributor PRs don't get access to repository secrets (`N8N_API_URL`, `N8N_API_KEY`, etc.)
2. **MSW Mock Server**: Mock Service Worker (MSW) is not properly intercepting HTTP requests in the CI environment
3. **Test Configuration**: Integration tests expect `http://localhost:3001/mock-api` but the mock server isn't responding

### Evidence

From CI logs (PR #343):
```
[CI-DEBUG] Global setup complete, N8N_API_URL: http://localhost:3001/mock-api
❌ No response from n8n server (repeated 60+ times across 20 tests)
```

The tests ARE using the correct mock URL, but MSW isn't intercepting the requests.

### Why This Happens

**For External PRs:**
- GitHub Actions doesn't expose repository secrets for security reasons
- Prevents malicious PRs from exfiltrating secrets
- MSW setup runs but requests don't get intercepted in CI

**Test Configuration:**
- `.env.test` line 19: `N8N_API_URL=http://localhost:3001/mock-api`
- `.env.test` line 67: `MSW_ENABLED=true`
- CI workflow line 75-80: Secrets set but empty for external PRs

### Impact

- ✅ **Code Quality**: NOT affected - the actual code changes are correct
- ✅ **Local Testing**: Works fine - MSW intercepts requests locally
- ❌ **CI for External PRs**: Integration tests fail (infrastructure issue)
- ✅ **CI for Internal PRs**: Works fine (has access to secrets)

### Current Workarounds

1. **For Maintainers**: Use `--admin` flag to merge despite failing tests when code is verified correct
2. **For Contributors**: Run tests locally where MSW works properly
3. **For CI**: Unit tests pass (don't require n8n API), integration tests fail

### Files Affected

- `tests/integration/setup/integration-setup.ts` - MSW server setup
- `tests/setup/msw-setup.ts` - MSW configuration
- `tests/mocks/n8n-api/handlers.ts` - Mock request handlers
- `.github/workflows/test.yml` - CI configuration
- `.env.test` - Test environment configuration

### Potential Solutions (Not Implemented)

1. **Separate Unit/Integration Runs**
   - Run integration tests only for internal PRs
   - Skip integration tests for external PRs
   - Rely on unit tests for external PR validation

2. **MSW CI Debugging**
   - Add extensive logging to MSW setup
   - Check if MSW server actually starts in CI
   - Verify request interception is working

3. **Mock Server Process**
   - Start actual HTTP server in CI instead of MSW
   - More reliable but adds complexity
   - Would require test infrastructure refactoring

4. **Public Test Instance**
   - Use publicly accessible test n8n instance
   - Exposes test data, security concerns
   - Would work for external PRs

### Decision

**Status**: Documented but not fixed

**Rationale**:
- Integration test infrastructure refactoring is separate concern from code quality
- External PRs are relatively rare compared to internal development
- Unit tests provide sufficient coverage for most changes
- Maintainers can verify integration tests locally before merging

### Testing Strategy

**For External Contributor PRs:**
1. ✅ Unit tests must pass
2. ✅ TypeScript compilation must pass
3. ✅ Build must succeed
4. ⚠️ Integration test failures are expected (infrastructure issue)
5. ✅ Maintainer verifies locally before merge

**For Internal PRs:**
1. ✅ All tests must pass (unit + integration)
2. ✅ Full CI validation

### References

- PR #343: First occurrence of this issue
- PR #345: Documented the infrastructure issue
- Issue: External PRs don't get secrets (GitHub Actions security)

### Last Updated

2025-10-21 - Documented as part of PR #345 investigation
