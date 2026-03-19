# React Scan - Local Performance Investigation

React Scan helps identify unnecessary re-renders and component performance issues during local development.

## Installation

React Scan is already installed as a dev dependency. It is NOT included in production builds.

## Usage

### Method 1: Browser DevTools Extension (Recommended)

1. Install the [React Scan Chrome Extension](https://chromewebstore.google.com/detail/react-scan)
2. Open DevTools and navigate to the "React Scan" tab
3. Enable scanning and interact with the application

### Method 2: Script Injection

Temporarily add to `src/app/layout.tsx` in the `<head>`:

```tsx
{process.env.NODE_ENV === "development" && (
  <Script
    src="https://unpkg.com/react-scan/dist/auto.global.js"
    strategy="beforeInteractive"
  />
)}
```

### Method 3: Programmatic Usage

```typescript
import { scan } from "react-scan";

// In a useEffect in development:
if (process.env.NODE_ENV === "development") {
  scan({
    enabled: true,
    log: true, // Log re-renders to console
  });
}
```

## What to Look For

1. **Red highlights**: Components re-rendering frequently
2. **Console logs**: Show which props/state caused re-renders
3. **Component tree**: Visualize render cascades

## Common Causes of Unnecessary Re-renders

1. **Inline objects/arrays as props**: `<Component style={{ color: 'red' }} />`
2. **Inline arrow functions**: `<Button onClick={() => doSomething()} />`
3. **Missing memoization**: Heavy computations not wrapped in `useMemo`
4. **State in wrong component**: State too high in tree causing child re-renders

## Common Fixes

1. **Memoization**: Use `React.memo()`, `useMemo()`, `useCallback()`
2. **State colocation**: Move state closer to where it's used
3. **Splitting components**: Break large components into smaller pieces
4. **Stable references**: Extract inline objects/functions outside render

## Example: Finding Re-render Issues

```tsx
// Before: Causes re-render every time
function ParentComponent() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
      <ExpensiveChild data={{ items: [] }} /> {/* Re-renders on every count change! */}
    </div>
  );
}

// After: Memoized to prevent unnecessary re-renders
const MemoizedChild = React.memo(ExpensiveChild);

function ParentComponent() {
  const [count, setCount] = useState(0);
  const data = useMemo(() => ({ items: [] }), []);

  return (
    <div>
      <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
      <MemoizedChild data={data} />
    </div>
  );
}
```

## Do NOT Use in CI

React Scan is for local investigation only. It adds overhead and is not suitable for CI or production.

## When to Investigate

Use React Scan when:

- Web Vitals metrics (INP, LCP) show regressions
- UI feels sluggish during interactions
- Profiler shows excessive component renders
- After adding new features that might affect render performance

## Related Tools

- **React DevTools Profiler**: For more detailed component timing
- **Chrome Performance Tab**: For overall main thread analysis
- **Lighthouse**: For automated performance audits
