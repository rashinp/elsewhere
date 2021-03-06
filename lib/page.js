var _         = require('underscore')._,
    scraper   = require('./scraper.js'),
    fn        = require('./functions.js'),
    urlParser = require('url');

// The Page object. Stores important scraped information
// such as 'rel=me' links, the url they were found on as
// well as the favicon.
function Page (url, grapher, options, sourceUrl, level) {
  this.url         = url;
  this.title       = '';
  this.favicon     = '';
  this.requestTime = 0;
  this.links       = [];
  this.status      = 'unfetched';
  this.verified    = false;
  this.grapher     = grapher;
  this.options     = options;
  this.sourceUrl   = sourceUrl;
  this.level       = level;
  this.errorMsg    = '';
  this.aliases     = [];

  // add the domain from url into count
  grapher.appendDomainCount(url);
}

Page.prototype = {

  constructor: Page,

  fetch: function (callback) {
    var self = this, 
        logger = this.options.logger,
        populate;

    this.status = "fetching";

    // if we have a valid url that can be parsed
    if (urlParser.parse(self.url).hostname) {

      populate = function (err, data) {
        if (!err) {
          self.title = data.title;
          self.links = data.links;
          self.favicon = data.favicon;
          self.requestTime = data.requestTime;
          
          if (data.resolvedUrl && data.resolvedUrl !== self.url) {
            self.aliases.push(self.url);
            self.url = data.resolvedUrl;
          }

          self.grapher.replaceAliases();
          self.grapher.verifyPages();
          self.addPages(self.links, self.url);
          self.status = "fetched";
        } else {
          self.errorMsg = err;
          self.status = "errored";
        }
        callback(self);
      };

      scraper.scrape(this.url, this.options, populate);
    } else {
      logger.warn('url failed to parse correctly: ' + this.url);
      this.errorMsg = 'url failed to parse correctly: ' + this.url;
      this.status = "errored";
      callback();
    }
  },


  // Used by `Page.fetch` to add new Page objects to the Grapher
  // for each link which has not yet been found.
  addPages: function (newLinks, sourceUrl) {
    var grapher = this.grapher,
        options = this.options,
        logger  = this.options.logger,
        level   = (this.verified ? 1 : this.level + 1);

    _.each(newLinks, function (newLink) {
      if (!grapher.alreadyUsed(newLink)) {
        if (!grapher.aboveDomainLimit(newLink)) {
            grapher.pages[newLink] = new Page(newLink, grapher, options, sourceUrl, level);
          } else {
            logger.log('excluded above domain limit: ' + newLink);
          }
        }else{
          logger.log('excluded already has a page object: ' + newLink);
      }
    });
  },

  toLiteral: function (props) {
    var rtnObj = {};

    if (_.contains(props, 'url')) {
      rtnObj['url'] = this.url;
    }

    if (_.contains(props, 'title')) {
      rtnObj['title'] = this.title;
    }

    if (_.contains(props, 'favicon')) {
      rtnObj['favicon'] = this.favicon;
    }

    if (_.contains(props, 'links')) {
      rtnObj['outboundLinks'] = this.getVerifiedLinksObject();
    }

    if (_.contains(props, 'inboundCount')) {
      rtnObj['inboundCount'] = this.countInboundLinks();
    }

    if (_.contains(props, 'verified')) {
      rtnObj['verified'] = this.verified;
    }

    if (_.contains(props, 'level')) {
      rtnObj['level'] = this.level;
    }

    if (_.contains(props, 'sourceUrl')) {
      rtnObj['sourceUrl'] = this.sourceUrl;
    }

    if (_.contains(props, 'aliases')) {
      rtnObj['urlAliases'] = this.aliases;
    }

    return rtnObj;
  },

  getWarning: function () {
    if (this.errorMsg !== '') {
      return this.errorMsg;
    } else {
      return null;
    }
  },

  countInboundLinks: function () {
    var self       = this,
        selfDomain = urlParser.parse(self.url).hostname,
        rtnObj     = {verified:0,unverified:0};

    _.each(self.grapher.pages, function (page) {
      var pageDomain = urlParser.parse(page.url).hostname,
          isIncluded = _.any(page.links, function (link) {
            return fn.sameUrl(link, self.url);
          });

      if (isIncluded && pageDomain !== selfDomain) {
        if (page.verified) {
          rtnObj.verified++;
        } else {
          rtnObj.unverified++;
        }
      }
    });

    return rtnObj;
  },

  removeDeeperLinks: function (links) {
    if (links.length < 2) {
      return links;
    }

    var rtnArr = [];

    _.each(links, function (currUrl) {
      var currUrlHostname   = urlParser.parse(currUrl).hostname,
          sameHostnamePages = [],
          hasShorterPaths   = false,
          currUrlPath, currUrlDepth;

      sameHostnamePages = _.filter(links, function (url) {
        return currUrlHostname === urlParser.parse(url).hostname && url !== currUrl;
      });

      if (_.isEmpty(sameHostnamePages)) {
        rtnArr.push(currUrl);
      } else {
        currUrlPath = fn.url.removeTrailingSlash(urlParser.parse(currUrl).path);
        currUrlDepth = currUrlPath.split('/').length;

        hasShorterPaths = _.any(sameHostnamePages, function (url) {
          var urlPath  = fn.url.removeTrailingSlash(urlParser.parse(url).path),
              urlDepth = urlPath.split('/').length;

          return urlDepth < currUrlDepth;
        });

        if (!hasShorterPaths) {
          rtnArr.push(currUrl);
        }
      }
    });

    return rtnArr;
  },

  // returns a page's links sorted into 'verified'
  // and 'unverified' arrays
  getVerifiedLinksObject: function () {
    var self   = this,
        rtnObj = {verified:[],unverified:[]};

    // sort the links
    self.links.filter(function (link) {
      if (self.grapher.verifiedLink(link)) {
        rtnObj.verified.push(link);
      } else {
        rtnObj.unverified.push(link);
      }
    });

    // remove duplicates
    rtnObj.verified   = _.uniq(rtnObj.verified);
    rtnObj.unverified = _.uniq(rtnObj.unverified);

    if (self.grapher.options.stripDeeperLinks) {
      rtnObj.verified   = self.removeDeeperLinks(rtnObj.verified);
      rtnObj.unverified = self.removeDeeperLinks(rtnObj.unverified);
    }

    return rtnObj;
  }
}

exports.Page = Page;