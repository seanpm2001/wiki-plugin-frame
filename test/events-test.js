(function() {
  const frame = require('../client/frame'),
        expect = require('expect.js');

  describe('events', () => {

    describe('triggerThumb', () => {
      let $item, actual = [];
      beforeEach(() => {
        $item = {trigger: (...args) => actual = Array.from(args)};
      });
      it('follows the existing jQuery event protocol', () => {
        frame.triggerThumb($item, "Some Column Heading");
        expect(actual[0]).to.be("thumb");
        expect(actual[1]).to.be("Some Column Heading");
      });
    });

    describe('publishSourceData', () => {
      context('with mock browser context for origin, location, and DOM', () => {
        let $item, div, actualEvent;
        beforeEach(() => {
          // The amount of setup needed for this test is a big code smell.
          // We are mocking jQuery and DOM objects which are pretty tangled.
          // We'll hold our nose for now.
          // Also, the nature of the code under test works through side effects.
          // Some amount of mess in the test is to be expected.
          window = {
            origin: 'https://example.com',
            location: {host: 'example.com'},
          }
          div = {
            classList: new Set(),
            dispatchEvent(event) {actualEvent = event;}
          };
          $item = {
            get(n) {return div;},
            data(which='ALL') { /* $item */
              switch(which) {
              case 'ALL': return {id: 'a56fab'};
              default: return new Error(`$item.data() unexpected key: ${which}`);
              }
            },
            parents(_) { /*TODO error if _ is not '.page'? */ return {
              data(which) { /* $page */
                switch(which) {
                case 'key': return 'b78fab';
                case 'data': return {title:'Some Page Title'};
                case 'site': return undefined;
                default: return new Error('unexpected key for data()');
                }
              },
              attr(which) {
                switch(which) {
                case 'id': return 'some-page-title';
                default: return new Error('unexpected key for attr()');
                }
              }
            };}
          };

          frame.publishSourceData($item, 'foo', {FOO:'BAR'});
        });
        it('includes identifiers from the browser context', () => {
          expect(actualEvent).to.have.property('detail');
          expect(actualEvent.detail).to.have.property('pageKey', 'b78fab');
          expect(actualEvent.detail).to.have.property('itemId', 'a56fab');
          expect(actualEvent.detail).to.have.property('origin', 'https://example.com');
          expect(actualEvent.detail).to.have.property('site', 'example.com');
          expect(actualEvent.detail).to.have.property('slug', 'some-page-title');
          expect(actualEvent.detail).to.have.property('title', 'Some Page Title');
        });
        it('adds a topic-source class to the div', () => {
          expect(div.classList.has('foo-source')).to.equal(true);
        });
        it('adds an accessor to the div', () => {
          expect(div).to.have.property('fooData');
          const data = div.fooData();
          expect(data).to.have.property('FOO');
          expect(data.FOO).to.be('BAR');
        });
        it('uses a custom event type for the given topic', () => {
          expect(actualEvent).to.have.property('type', 'fooStream');
        });
        it('configures the custom event to bubble', () => {
          expect(actualEvent).to.have.property('bubbles', true);
        });
        it('includes the data in the custom event', () => {
          expect(actualEvent).to.have.property('detail');
          expect(actualEvent.detail).to.have.property('FOO');
          expect(actualEvent.detail.FOO).to.be('BAR');
        });
      });
    });

  });

}).call(this)
