import { mentionQuery, insertMention, extractMentions, splitMentions, suggest } from '@/lib/mentions';

const people = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Ann Marie' }, { id: 'c', name: 'Wanjiru Njeri' }];

describe('mentions', () => {
  it('detects an @ being typed, only at a word start', () => {
    expect(mentionQuery('Hi @wan', 7)).toEqual({ start: 3, query: 'wan' });
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' });
    expect(mentionQuery('mail me at me@x', 15)).toBeNull();
    expect(mentionQuery('Hi @wan there', 13)).toBeNull();
  });
  it('inserts the full name and moves the caret after it', () => {
    expect(insertMention('Hi @wan!', 3, 7, 'Wanjiru Njeri')).toEqual({ text: 'Hi @Wanjiru Njeri !', caret: 18 });
  });
  it('finds who was mentioned, preferring the longest name', () => {
    expect(extractMentions('Thanks @Ann Marie and @Wanjiru Njeri', people).sort()).toEqual(['b', 'c']);
    expect(extractMentions('Thanks @Ann', people)).toEqual(['a']);
    expect(extractMentions('No mentions', people)).toEqual([]);
  });
  it('splits text for highlighting', () => {
    expect(splitMentions('Ping @Ann Marie now', ['Ann', 'Ann Marie'])).toEqual([
      { text: 'Ping ', mention: false }, { text: '@Ann Marie', mention: true }, { text: ' now', mention: false },
    ]);
  });
  it('suggests by first or last name', () => {
    expect(suggest(people, 'nj').map((p) => p.id)).toEqual(['c']);
    expect(suggest(people, 'mar').map((p) => p.id)).toEqual(['b']);
  });
});
