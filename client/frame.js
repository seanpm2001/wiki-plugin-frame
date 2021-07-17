(function() {

  const resizeFudge = 30
  const defaultHeight = 150 - resizeFudge

  function expand(text) {
    return wiki.resolveLinks(
      text,
      (intext) => intext
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
    )
  }

  function validateDomain(url) {
    const re = /^(?:https?:)?\/\/((([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}|localhost)(:[0-9]{2,})?)(\/|$)/i
    const matchData = url.match(re)
    const src = url
    if (matchData) {
      const hostname = matchData[1]
      return {src, hostname}
    } else {
      const error = 'Error: frame src must include domain name'
      return {src, error}
    }
  }

  function parse(text) {
    const [url, ...rest] = text.split("\n")
    let src = validateDomain(url)
    let height = defaultHeight, matchData
    const caption = []
    const sources = new Set()
    const lineups = new Set()
    for (let line of rest) {
      if (matchData = line.match(/^HEIGHT (\w+)/)) {
        height = +matchData[1]
        continue
      } else if (matchData = line.match(/^SOURCE (\w+)/)) {
        sources.add(matchData[1])
      } else if (matchData = line.match(/^LINEUP (\w+)/)) {
        lineups.add(matchData[1])
      } else {
        caption.push(line)
      }
    }
    return {
      ...src,
      caption: caption.join("\n"),
      sandbox: 'allow-scripts',
      height,
      sources,
      lineups
    }
  }

  function identifiers($item, item) {
    const $page = $item.parents('.page')
    return {
      pageKey: $page.data("key"),
      itemId: item.id,
      site: $page.data("site") || window.location.host,
      slug: $page.attr("id"),
      title: $page.data("data").title
    }
  }

  function drawFrame($item, item, parsed) {
    $item.append('<iframe></iframe><p></p>')
    const params = new URLSearchParams(identifiers($item, item)).toString()
    $item.find('iframe').attr({
      width: '100%',
      style: 'border: none;',
      src: `${parsed.src}#${params}`,
      sandbox: parsed.sandbox
    })
    resize($item, parsed.height)
    $item.find('p').html(expand(parsed.caption))
  }

  function drawError($item, item, parsed) {
    return $item.append(`
        <pre class="error">${parsed.error}</pre>
        <pre>${item.text}</pre>`)
  }

  function emit($item, item) {
    const parsed = parse(item.text)
    $item.css({
      'background-color': '#eee',
      'padding': '15px'
    })
    if (!parsed.hasOwnProperty('error')) {
      drawFrame($item, item, parsed)
    } else { // display error
      drawError($item, item, parsed)
    }
    return $item
  }

  function bind($item, item) {
    const parsed = parse(item.text)
    const div = $item.get(0)
    const lineup = div.closest('.main')
    const iframe = div.querySelector('iframe')
    const ids = identifiers($item, item)
    for (let topic of parsed.lineups) {
      addLineupListener(lineup, iframe, topic)
    }
    for (let topic of parsed.sources) {
      addSource(div, topic)
    }
    return $item.dblclick(() => {
      return wiki.textEditor($item, item)
    })
  }

  function addLineupListener(lineup, iframe, topic) {
    lineup.addEventListener(`${topic}Stream`, ({detail}) =>
      iframe.contentWindow.postMessage({
        ...detail,
        action: `${topic}Stream`
      }, "*")
    )
  }

  function requestSourceData($item, topic) {
    let nearest = null
    for (let div of document.querySelectorAll(`.item`)) {
      if (div.classList.contains(`${topic}-source`)) {
        nearest = div
      }
      if (div === $item.get(0)) {
        break
      }
    }
    let sourceData = {}
    if (nearest) {
      sourceData = nearest[`${topic}Data`]()
    } else {
      sourceData = {
        error: `cannot find a source for "${topic}" in the lineup`,
        ids: identifiers($item, $item.data())
      }
    }
    return sourceData
  }

  function publishSourceData($item, topic, sourceData) {
    const div = $item.get(0)
    div[`${topic}Data`] = () => sourceData
    addSource(div, topic)
    const topicEvent = new CustomEvent(`${topic}Stream`, {
      bubbles: true,
      detail: {
        ...identifiers($item, $item.data()),
        ...sourceData
      }
    })
    div.dispatchEvent(topicEvent)
  }

  function addSource(div, topic) {
    div.classList.add(`${topic}-source`)
  }

  function triggerThumb($item, thumb) {
    $item.trigger("thumb", thumb)
  }

  function showImporter(pages, options={}) {
    const result = wiki.newPage({title:"Import from Frame"})
    // Importer plugin expects to compute dates from journals in
    // pages. here we hack a default date to allow frame authors to
    // create pages without journals
    const date = new Date();
    for (let p of Object.values(pages)) {
      if (typeof p.journal === "undefined" || p.journal == null) {
        p.journal = [{date}]
      }
    }
    result.addParagraph(`Import of ${Object.keys(pages).length} pages.`)
    result.addItem({type: 'importer', pages})
    wiki.showResult(result, options)
  }

  function resize($item, height) {
    const el = $item.get(0)
    el.dataset.height = height+resizeFudge
    el.querySelector('iframe').setAttribute('height', height+resizeFudge)
  }

  function frameListener(event) {
    const {data} = event;
    const {action, keepLineup=false, pageKey=null, page=null, pages={},
           title=null, site=null} = data;
    let options

    const $iframe = $("iframe").filter((i,el) => el.contentWindow === event.source)
    const $item = $iframe.parents(".item")
    let $page = null
    if (pageKey != null) {
      $page = $('.page').filter((i, el) => $(el).data('key') == pageKey)
    }
    if ($page == null || $page.length == 0) {
      $page = $iframe.parents('.page')
    }

    let {name, topic, sourceData} = data
    switch (action) {
    case "sendFrameContext":
      event.source.postMessage({
        action: "frameContext",
        site: $page.data("site") || window.location.host,
        slug: $page.attr("id"),
        item: $item.data("item"),
        page: $page.data("data")
      }, "*")
      break
    case "showResult":
      options = keepLineup ? {} : {$page}
      wiki.showResult(wiki.newPage(page), options)
      break
    case "doInternalLink":
      if (keepLineup) {
        wiki.doInternalLink(title, null, site)
      } else {
        wiki.doInternalLink(title, $page, site)
      }
      break
    case "importer":
      options = keepLineup ? {} : {$page}
      showImporter(pages, options)
      break
    case "resize":
      let height = data.height || +$item.data('height') || defaultHeight
      resize($item, height)
      break
    case "requestSourceData":
      sourceData = requestSourceData($item, topic)
      event.source.postMessage({
        action: "sourceData",
        topic,
        sourceData
      }, "*")
      break
    case "publishSourceData":
      // TODO change name to topic
      publishSourceData($item, name, sourceData)
      break
    case "triggerThumb":
      const {thumb} = data
      triggerThumb($item, thumb)
      break
    default:
      console.error({where:'frameListener', message: "unknown action", data})
    }
  }

  if (typeof window !== "undefined" && window !== null) {
    wiki = window.wiki
    window.plugins.frame = {emit, bind}
    if (typeof window.frameListener !== "undefined" || window.frameListener == null) {
      window.frameListener = frameListener
      window.addEventListener("message", frameListener)
    }
  }

  if (typeof module !== "undefined" && module !== null) {
    wiki = {resolveLinks: (text, escape) => escape(text)}
    module.exports = {expand, parse, publishSourceData, triggerThumb}
  }

}).call(this)
