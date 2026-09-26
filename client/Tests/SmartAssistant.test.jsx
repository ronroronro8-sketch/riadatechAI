import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'node:util';
import { ReadableStream } from 'node:stream/web';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import SmartAssistant from '../src/Components/SmartAssistant';
import { readAssistantStream } from '../src/api/assistantStream';
vi.mock('../src/Components/SiteFooter', () => ({ default: () => null }));
const encoder = new TextEncoder();
function response(body) { return { ok: true, status: 200, headers: { get: () => 'application/x-ndjson; charset=utf-8' }, body }; }
const conversationId = '123456789012345678901234';
let streamFetch;
function mount(url = '/assistant', guest = false, locale = 'ar') {
  const store = configureStore({ reducer: { auth: (state = { user: guest ? null : { _id: 'owner' }, authChecked: true }, action) => action.type === 'logout-test' ? { user: null, authChecked: true } : state } });
  const view = render(React.createElement(Provider, { store }, React.createElement(MemoryRouter, { initialEntries: [url] }, React.createElement(SmartAssistant, { locale }))));
  return { ...view, store };
}
async function start() {
  mount();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'فكرة مشروع' } });
  fireEvent.click(screen.getByRole('button', { name: 'إرسال' }));
  await waitFor(() => expect(streamFetch).toHaveBeenCalled());
}
beforeEach(() => {
  vi.stubGlobal('TextDecoder', TextDecoder);
  streamFetch = vi.fn();
  vi.stubGlobal('fetch', vi.fn((url, options) => {
    if (url.endsWith('/api/conversations') && options.method === 'GET') return Promise.resolve({ ok: true, json: async () => ({ conversations: [] }) });
    if (url.endsWith('/api/conversations')) return Promise.resolve({ ok: true, json: async () => ({ conversation: { _id: conversationId } }) });
    return streamFetch(url, options);
  }));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('Smart Assistant real component streaming', () => {
  it('shows text before EOF in one bubble and assembles exact text', async () => {
    let controller;
    streamFetch.mockResolvedValue(response(new ReadableStream({ start(c) { controller = c; } })));
    await start();
    await act(async () => { controller.enqueue(encoder.encode('{"type":"delta","text":"مرحبا "}\n')); });
    expect(screen.getByText('مرحبا')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(document.querySelectorAll('.rt-assistant-message-assistant')).toHaveLength(1);
    const tail = '{"type":"delta","text":"نعم نعم 🌟"}\n' + JSON.stringify({ type: 'done', length: 'مرحبا نعم نعم 🌟'.length }) + '\n';
    await act(async () => {
      for (const byte of encoder.encode(tail)) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    });
    expect(screen.getByText('مرحبا نعم نعم 🌟')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).not.toBeDisabled();
    expect(document.querySelectorAll('.rt-assistant-message-assistant')).toHaveLength(1);
  });
  it('retains partial reply and shows interruption error on premature EOF', async () => {
    streamFetch.mockResolvedValue(response(new ReadableStream({ start(c) { c.enqueue(encoder.encode('{"type":"delta","text":"جزء محفوظ"}\n')); c.close(); } })));
    await start();
    expect(await screen.findByText('جزء محفوظ')).toBeInTheDocument();
    expect(await screen.findByText(/انقطع الرد قبل اكتماله/)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });
  it('keeps existing HTTP error handling', async () => {
    streamFetch.mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'Smart Assistant request failed. Please try again later.' }) });
    await start();
    expect(await screen.findByText('Smart Assistant request failed. Please try again later.')).toBeInTheDocument();
  });
  it('aborts request when leaving page', async () => {
    streamFetch.mockImplementation(() => new Promise(() => {}));
    await start();
    const signal = streamFetch.mock.calls[0][1].signal;
    cleanup(); expect(signal.aborted).toBe(true);
  });
});
it.each([
  '{"type":"delta","text":"x"}\n{"type":"done","length":2}\n',
  '{"type":"error","error":"STREAM_INTERRUPTED"}\n',
  '{"type":"delta","text":"x"}\n{"type":"done","length":1}\n{"type":"delta","text":"x"}\n',
  '{"type":"delta","text":"x"}\n{"type":"done"',
])('rejects corrupt or interrupted stream %#', async (raw) => {
  const stream = response(new ReadableStream({ start(c) { c.enqueue(encoder.encode(raw)); c.close(); } }));
  await expect(readAssistantStream(stream, () => {}, 'interrupted')).rejects.toThrow('interrupted');
});

function completedStream(text) {
  return response(new ReadableStream({ start(c) {
    c.enqueue(encoder.encode(JSON.stringify({ type: 'delta', text }) + '\n' + JSON.stringify({ type: 'done', length: text.length }) + '\n')); c.close();
  } }));
}
it('creates a conversation then sends only message, conversationId and requestId with session credentials', async () => {
  streamFetch.mockResolvedValue(completedStream('جواب'));
  await start();
  await screen.findByText('جواب');
  const options = streamFetch.mock.calls[0][1];
  expect(options.credentials).toBe('include');
  expect(options.headers['X-RiadaTech-Request']).toBe('1');
  const body = JSON.parse(options.body);
  expect(Object.keys(body).sort()).toEqual(['conversationId', 'message', 'requestId']);
  expect(body.conversationId).toBe(conversationId);
  expect(body.requestId).toMatch(/^[a-f0-9-]{36}$/);
});
it('refresh restores saved messages from the URL without calling Gemini or creating a conversation', async () => {
  streamFetch.mockResolvedValue({ ok: true, json: async () => ({ conversation: { _id: conversationId, status: 'active' }, messages: [
    { _id: 'user-1', role: 'user', requestId: 'saved-request', text: 'ميزانيتي 3750 ريال عماني', status: 'completed' },
    { _id: 'assistant-1', role: 'assistant', requestId: 'saved-request', text: 'رسالة محفوظة', status: 'completed' },
  ], nextAfter: null }) });
  mount('/assistant?conversationId=' + conversationId);
  expect(await screen.findByText('رسالة محفوظة')).toBeInTheDocument();
  expect(screen.getByText('ميزانيتي 3750 ريال عماني')).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(streamFetch.mock.calls[0][0]).toContain('/api/conversations/' + conversationId);
  expect(streamFetch.mock.calls[0][1].credentials).toBe('include');
});
it('retry keeps requestId and replaces partial assistant text without duplicate bubbles', async () => {
  streamFetch.mockResolvedValueOnce(response(new ReadableStream({ start(c) { c.enqueue(encoder.encode('{"type":"delta","text":"جزء"}\n')); c.close(); } })))
    .mockResolvedValueOnce(completedStream('الجواب الكامل'));
  await start();
  await screen.findByText(/انقطع الرد قبل اكتماله/);
  fireEvent.click(screen.getByRole('button', { name: 'إرسال' }));
  await screen.findByText('الجواب الكامل');
  expect(JSON.parse(streamFetch.mock.calls[0][1].body).requestId).toBe(JSON.parse(streamFetch.mock.calls[1][1].body).requestId);
  expect(document.querySelectorAll('.rt-assistant-message-user')).toHaveLength(1);
  expect(document.querySelectorAll('.rt-assistant-message-assistant')).toHaveLength(1);
});
it('logging out clears private restored messages', async () => {
  streamFetch.mockResolvedValue({ ok: true, json: async () => ({ conversation: { status: 'active' }, messages: [
    { _id: 'saved', role: 'assistant', text: 'رد خاص', status: 'completed' },
  ], nextAfter: null }) });
  const { store } = mount('/assistant?conversationId=' + conversationId);
  await screen.findByText('رد خاص');
  act(() => store.dispatch({ type: 'logout-test' }));
  expect(screen.queryByText('رد خاص')).not.toBeInTheDocument();
  expect(screen.getByText(/سجّل الدخول/)).toBeInTheDocument();
});

it('accepts optional official source metadata on done without changing streamed text', async () => {
  const body = new ReadableStream({ start(controller) {
    controller.enqueue(encoder.encode(JSON.stringify({ type: 'delta', text: 'جواب [K1]' }) + '\n' +
      JSON.stringify({ type: 'done', length: 'جواب [K1]'.length, sources: [{ title: 'مصدر رسمي', url: 'https://gov.om/w/example', authority: 'جهة رسمية', updatedAt: null }] }) + '\n'));
    controller.close();
  } });
  const received = [];
  await readAssistantStream(response(body), text => received.push(text), 'interrupted');
  expect(received.join('')).toBe('جواب [K1]');
});

it('allows guest streaming without creating or loading account conversations', async () => {
  streamFetch.mockResolvedValue(completedStream('Guest answer'));
  mount('/assistant', true, 'en');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  await screen.findByText('Guest answer');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(streamFetch.mock.calls[0][0]).toContain('/api/smart-assistant/guest');
});
it('renders Markdown tables and safe collapsible response sources', async () => {
  const text = '**Result**\n\n| Item | Value |\n| --- | --- |\n| Profit | 100 |\n\n- First';
  streamFetch.mockResolvedValue(response(new ReadableStream({ start(c) {
    c.enqueue(encoder.encode(JSON.stringify({ type: 'delta', text }) + '\n' + JSON.stringify({ type: 'done', length: text.length, sources: [{ title: 'Official', url: 'https://gov.om' }] }) + '\n')); c.close();
  } })));
  await start();
  await screen.findByRole('table');
  expect(screen.getByText('Result').tagName).toBe('STRONG');
  const source = await screen.findByText('Official');
  expect(source.closest('details')).not.toHaveAttribute('open');
});
it('does not pull the reader down during streaming and offers jump to latest', async () => {
  let controller;
  streamFetch.mockResolvedValue(response(new ReadableStream({ start(c) { controller = c; } })));
  await start();
  const scroller = document.querySelector('.rt-assistant-messages');
  Object.defineProperties(scroller, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 300 } });
  scroller.scrollTop = 100;
  fireEvent.scroll(scroller);
  await act(async () => controller.enqueue(encoder.encode('{"type":"delta","text":"hello"}\n')));
  expect(scroller.scrollTop).toBe(100);
  fireEvent.click(screen.getByRole('button', { name: 'الانتقال لأحدث رسالة' }));
  expect(scroller.scrollTop).toBe(1000);
  await act(async () => { controller.enqueue(encoder.encode('{"type":"done","length":5}\n')); controller.close(); });
});
it('opens and closes tools drawer and starts a fresh chat', () => {
  mount('/assistant', true);
  fireEvent.click(screen.getByRole('button', { name: 'فتح القائمة' }));
  expect(document.querySelector('.rt-assistant-sidebar')).toHaveClass('is-open');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(document.querySelector('.rt-assistant-sidebar')).not.toHaveClass('is-open');
  fireEvent.click(screen.getByRole('button', { name: /محادثة جديدة/ }));
  expect(screen.getByRole('textbox')).toHaveValue('');
});
