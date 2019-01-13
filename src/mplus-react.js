import React from "react";
import flyd from "flyd";
import md5 from "js-md5";
import { decode } from "base64-arraybuffer";
import WebCam from "react-webcam";
import PropTypes from "prop-types";

const kont = {};

export const shallowDiffers = (a, b) => {
  if (!a && b) return true;
  for (const i in a) if (!(i in b)) return true;
  for (const i in b) if (a[i] !== b[i]) return true;
  return false;
};

const hash = value => {
  const _value = [];
  for (const k in value) {
    if (typeof value[k] == "undefined" || typeof value[k] == "function")
      continue;
    if (typeof value[k] == "object" && value[k].getId) {
      _value.push(k);
      _value.push(value[k].getId()); // MaximoPlus object
    } else {
      _value.push(k);
      _value.push(value[k]);
    }
  }

  return md5(JSON.stringify(_value));
};

const difference = (a1, a2) => {
  const result = [];
  for (let i = 0; i < a1.length; i++) {
    if (a2.indexOf(a1[i]) === -1) {
      result.push(a1[i]);
    }
  }
  return result;
};

const isCordovaApp = !!window.cordova;

const dialogRefInnerIds = [];
// when the dialog opens it will open the inner contexts for the MaximoPlus controls inside the dialog. Once it
// closes we need to clean up that. We will simply see the difference at the time of closing and remove these contexts.
// We need this to be an array, because we may open the dialog from another dialog , like the stack, we need to record the contexts  at the time of opening the dialog
const externalRootContext = {};
export const setExternalRootContext = rootContext => {
  externalRootContext.ctx = rootContext;
};

const getRootContext = () => externalRootContext.ctx;

const resolveContainer = (contid, container) => {
  if (kont[contid]) {
    if (kont[contid].resolved) return;
    kont[contid].resolve(container);
    kont[contid].resolved = true;
  } else {
    kont[contid] = Promise.resolve(container);
    kont[contid].resolved = true;
  }
};

const getDeferredContainer = contId => {
  if (kont[contId]) {
    return kont[contId];
  }
  let _resolve = null;
  let _reject = null;
  const prom = new Promise(function(resolve, reject) {
    _resolve = resolve;
    _reject = reject;
  });
  prom.resolve = _resolve;
  prom.reject = _reject;
  kont[contId] = prom;
  return prom;
};

export const animating = flyd.stream(false);

const innerContexts = {};
// to simplify the things, we will calculate the id based on the props of the components, and then create the inner context. This will separate completely Maximoplus components from react components

/** Wrapper class for the maximoplus core library. Instead of directly calling updates from MaximoPlus
 * the wrapper calls the updates. This is the helper class for the provider, it proxies the state to the provider, and isolates the states of components
 */
class MaximoPlusWrapper {
  /** Constructor, add the actual
   * @param {object} rootContext
   * @param {string} contextId
   * @param {object} mp
   */
  constructor(rootContext, contextId, mp) {
    this.contextId = contextId;
    this.mp = mp;
    this.rootContext = rootContext;
    mp.addWrappedComponent(this);
    this.setState("mp", mp);
  }
  /** Method to be called from the core lib
   * @param {string} property
   * @return {object}
   */
  getInternalState(property) {
    return this.state && this.state[property];
  }
  /** Sets the internal state
   * @param {function} stateF
   */
  setInternalState(stateF) {
    const innerStateF = state => {
      // can't ise directly stateF, in case of the dialogs, we need to move the dialog to the upper leel
      const newState = stateF(state);
      const mfs = newState && newState["maxfields"];
      if (mfs) {
        for (let j = 0; j < mfs.length; j++) {
          const newDialogs = mfs[j].dialogs;
          if (!newDialogs) {
            continue;
          }
          let prevDialogs =
            state.maxfields.length == 0 || !state.maxfields[j]
              ? []
              : state.maxfields[j].dialogs;
          if (!prevDialogs) {
            prevDialogs = [];
          }
          if (newDialogs.length < prevDialogs.length) {
            closeDialog(this.rootContext);
          }
          if (newDialogs.length > prevDialogs.length) {
            openDialog(this.rootContext, newDialogs[0]);
          }
        }
      }
      // this sets the Context, not the state, we need to return the full state, not just the chenge
      return Object.assign({}, state, newState);
    };
    if (this.rootContext.getInnerState(this.contextId)) {
      this.rootContext.setInnerState(this.contextId, innerStateF);
    }
  }
  /** Method to close the dialog */
  closeDialog() {
    // this will be called only from the workflow dialog
    // we will ignore it and depend on the finished value
    closeDialog(this.rootContext);
  }
  /** State getter */
  get state() {
    return this.rootContext.getInnerState(this.contextId);
  }
  /** State setter
   * @param {string} property
   * @param {object} state
   */
  setState(property, state) {
    this.rootContext.setInnerState(this.contextId, _state => {
      const ret = _state ? { ..._state } : {};
      ret[property] = state;
      return ret;
    });
  }
}

/*
I will use react context to pass the data from Maximo to the components. The problem is that is difficult to control when the state is set from Maximo to the react component (if the component is mounted, not mounted, how many times the constructor is called, etc.) Instead of this, the context will be unique, based on the Maximo container of the component, and additional properties. In this way, even if the component is destroyed by React, it will still point to the same context. The key of this map is the internal Id, and the value is the context. Another thing we need is the Context Provider component, that we will call to update the state from MaximoPlus that will provide the value for the context
We will have only one context and context provider for the whole application, the consumers will get the data from the context based on their id.
*/

// Dialogs will use special inner context named "dialogs". Dialog holder component willl setup this context. The method from opeing and closing the dialog will be in the dialogcontext, and it will call this functions
export const openDialog = (rootContext, dialog) => {
  if (!rootContext || !rootContext.getInnerContext("dialogs")) {
    return;
  }

  dialogRefInnerIds.push(Object.keys(innerContexts));
  rootContext.setInnerState("dialogs", dialogs => {
    if (!dialogs) {
      return [dialog];
    }
    return [...dialogs, dialog];
  });
};
export const closeDialog = rootContext => {
  if (!rootContext || !rootContext.getInnerContext("dialogs")) {
    return;
  }
  if (dialogRefInnerIds.length == 0) {
    return;
  }
  const dff = difference(Object.keys(innerContexts), dialogRefInnerIds.pop());

  rootContext.setInnerState("dialogs", dialogs => {
    if (dialogs.length == 0) return [];
    const newDialogs = [...dialogs];
    newDialogs.pop();
    for (const j of dff) {
      if (innerContexts[j].mp && innerContexts[j].mp.dispose) {
        innerContexts[j].mp.dispose();
      }
      delete innerContexts[j];
    }
    rootContext.removeMultipleInnerContexts(dff);
    return newDialogs;
  });
};

/** The App Container, main application container for the app*/
export class AppContainer extends React.Component {
  /** Constructor, init the container from the core lib
   * @param {object} props
   */
  constructor(props) {
    super(props);
    if (kont[this.props.id] && kont[this.props.id].resolved) return;
    const mp = new maximoplus.basecontrols.AppContainer(
      this.props.mboname,
      this.props.appname
    );
    if (this.props.offlineenabled) {
      mp.setOfflineEnabled(true);
    }
    resolveContainer(this.props.id, mp);
    this.state = { mp: mp };
    this.save = this.save.bind(this);
    this.rollback = this.rollback.bind(this);
    this.mboCommand = this.mboCommand.bind(this);
    this.mboSetCommand = this.mboSetCommand.bind(this);
  }
  /** getter for the MaximoPlus core object */
  get mp() {
    return this.state.mp;
  }
  /**
   * Main render function
   * @return {React.ReactElement}
   */
  render() {
    return <div mboname={this.props.mboname} appname={this.props.appname} />;
  }
  /** Dispose the mp container */
  dispose() {
    // we will explicitely delete the cotnainer, and that will happen only for dynamic pages (dialogs)
    this.mp.dispose();
    delete kont[this.props.id];
  }
  /** Save all the pending changes in container */
  save() {
    this.state.mp.save();
  }
  /** Rollback all the pending changes in container */
  rollback() {
    this.mp.rollback();
  }
  /** Execute the mbocommand on the container
   * @param {string} command
   * @return {Promise}
   */
  mboCommand(command) {
    return this.mp.mboCommand(command);
  }
  /** Execute the mbo set command on the container
   * @param {string} command
   * @return {Promise}
   */
  mboSetCommand(command) {
    return this.mp.mboSetCommand(command);
  }
}

AppContainer.propTypes = {
  id: PropTypes.string,
  mboname: PropTypes.string,
  appname: PropTypes.string,
  offlineenabled: PropTypes.bool
};

const getDepContainer = containerConstF => {
  /** helper class for dep contaniers */
  class DepContainer extends React.Component {
    /** Constructor, intializs the template
     * @param {object} props
     */
    constructor(props) {
      super(props);
      if (kont[this.props.id] && kont[this.props.id].resolved) return;
      getDeferredContainer(this.props.id);
      this.mboCommand = this.mboCommand.bind(this);
      this.mboSetCommand = this.mboSetCommand.bind(this);
    }
    /** getter function for mp object
     * @return {object}
     */
    get mp() {
      return this.state.mp;
    }
    /** React lifecycle method use dto resolve the containers */
    componentDidMount() {
      if (kont[this.props.id] && kont[this.props.id].resolved) {
        kont[this.props.id].then(mp => this.setState({ mp: mp }));
        return;
      }

      kont[this.props.container].then(mboCont => {
        const mp = containerConstF(mboCont, this.props);
        this.setState({ mp: mp });
        resolveContainer(this.props.id, mp);
      });
    }

    /** Dumb render
     * @return {Void}
     */
    render() {
      return null;
    }
    /** Dispose related mp */
    dispose() {
      if (this.mp) {
        this.mp.dispose();
      }
      delete kont[this.props.id];
    }
    /** Execute the mbocommand on the container
     * @param {string} command
     * @return {Promise}
     */
    mboCommand(command) {
      return this.mp.mboCommand(command);
    }
    /** Execute the mbo set command on the container
     * @param {string} command
     * @return {Promise}
     */
    mboSetCommand(command) {
      return this.mp.mbosetCommand(command);
    }
  }
  DepContainer.propTypes = {
    id: PropTypes.string,
    container: PropTypes.string
  };
  return DepContainer;
};

export const RelContainer = getDepContainer((mboCont, props) => {
  return new maximoplus.basecontrols.RelContainer(mboCont, props.relationship);
});

export const SingleMboContainer = getDepContainer(
  (mboCont, props) => new maximoplus.basecontrols.SingleMboContainer(mboCont)
);

/** Basic React component class to be extended by all the visual components */
export class MPlusComponent extends React.Component {
  // the following tho methods should be overriden in the concrete implementations with
  // MPlusComponent.prototype.pushDialog = function (dialog)...
  /** Constructor, init the container from the core lib
   * @param {object} props
   */
  constructor(props) {
    super(props);
    this.oid = hash(this.props);
    this.removeContext = this.removeContext.bind(this);
  }
  /** getter for the MaximoPlus core object */
  get mp() {
    return innerContexts[this.oid] && innerContexts[this.oid].mp;
  }
  /** getter for the MaximoPlus wraooer object */
  get wrapper() {
    return innerContexts[this.oid] && innerContexts[this.oid].wrapper;
  }
  /** Dynamic context removal */
  removeContext() {
    // this will be used for dialogs only. Once the dialog is closed, we should remove the context and the MaximoPlus components
    this.context.removeInnerContext(this.oid);
    delete innerContexts[this.oid];
  }
  /** getter for the context */
  get Context() {
    return innerContexts[this.oid] && innerContexts[this.oid].context;
  }
  /** React lifecycle */
  componentDidMount() {
    /*
The components that sub-class this component may have the property container or maxcontainer (but not both).
container is string referencing the container (AppContainer, RelContainer...), maxcontainer is the container itself (usually called from the library code).
In case the container property is passed, we have to make sure container is available (promise is resolved), before we initiate the MaximoPlus library component (section, list...)
    */
    if (!innerContexts[this.oid]) {
      innerContexts[this.oid] = {
        context: this.context.addInnerContext(this.oid)
      };
    }
    if (this.props.container && this.props.maxcontainer) {
      throw Error("can't have both container and maxcontainer as properties");
    }

    if (this.props.container) {
      getDeferredContainer(this.props.container).then(container => {
        this.putContainer(container);
      });
    }
    if (this.props.maxcontainer) {
      this.putContainer(this.props.maxcontainer);
    }
    animating.map(val => this.setState({ animating: val })); // if component is animating don't display the change until the animation is finished
  }
  /** React lifecycle method used to init the MaximoPlus core component
   * @param {object} prevProps
   */
  componentDidUpdate(prevProps) {
    /* If for any reason container is changed in the property, we have to re-initialize*/
    if (this.props.container && this.props.container != prevProps.container) {
      getDeferredContainer(this.props.container).then(container => {
        this.putContainer(container);
      });
    }
    if (
      this.props.maxcontainer &&
      this.props.maxcontainer != prevProps.maxcontainer
    ) {
      this.putContainer(this.props.maxcontainer);
    }
  }
  /** React lifecycle method for performance controls
   * @param {object} nextProps
   * @param {object} nextState
   * @return {boolean}
   */
  shouldComponentUpdate(nextProps, nextState) {
    if (nextState.animating) {
      return false;
    }
    return (
      shallowDiffers(this.props, nextProps) ||
      shallowDiffers(this.state, nextState)
    );
  }
  /** Method to be overriden by the implementations */
  putContainer() {
    throw Error("should override");
  }
}

MPlusComponent.propTypes = {
  container: PropTypes.string,
  maxcontainer: PropTypes.object
};

/** HOC for component adapter
 * @param {object} Adapter
 * @return {MPlusComponent}
 */
export function getComponentAdapter(Adapter) {
  /** Adapter for integrating 3rd party libraries and controls */
  class MPAdapter extends MPlusComponent {
    /** constructor init the refs and bind
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.setMaxValue = this.setMaxValue.bind(this);
      this.adapterRef = React.createRef();
    }
    /** initialize the data for the control */
    initData() {
      this.mp.initData();
    }
    /** getter to get the value for the control
     * @return {object}
     */
    get adapterValue() {
      return (
        this.adapterRef.current &&
        this.adapterRef.current.getValue &&
        this.adapterRef.current.getValue()
      );
    }
    /** Initialize the underlying MaximoPlus component
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      const mp = new maximoplus.re.ComponentAdapter(
        mboCont,
        this.props.columns,
        this.props.norows ? this.props.norows : 1
      );
      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;

      mp.initData();
    }
    /** Render method of the component
     * @return {React.Element}
     */
    render() {
      if (!this.Context) return null;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            if (!value) return null;
            const rownum = value.currow;
            const maxrows = value.maxrows;
            const rowValue = maxrows ? maxrows[rownum] : {}; // for the sake of simplicity, by default return only one object
            if (this.props.norows && this.props.norows > 1) {
              return <Adapter maxrows={maxrows} ref={this.adapterRef} />;
            }
            return <Adapter {...rowValue} ref={this.adapterRef} />;
          }}
        </Consumer>
      );
    }
    /** Method to be called from the library or component to change the Maximo value
     * @param {string} column
     * @param {string} value
     */
    setMaxValue(column, value) {
      this.mp.setMaxValue(column, value);
    }
    /** Internal getter*/
    static get contextType() {
      return getRootContext();
    }
  }
  MPAdapter.propTypes = {
    columns: PropTypes.array,
    norows: PropTypes.number
  };
  return MPAdapter;
}

/** Function to open the current document from the doclinks in cordova. Wnem the user has chosen the document,
 * the doclinks contanier was navigated already to the desired row.  This function will use the cordova-plugin-file-opener2 and cordova-file-plugin
 * to download the file and open in it with the browser viewer.
 * @param {object} doclinksCont
 */
const cordovaOpenDoc = doclinksCont => {
  const dlUrl = maximoplus.net.getDownloadURL(
    this.state.doclinksCont,
    "doclinks",
    {}
  );
  const oReq = new XMLHttpRequest();
  oReq.open("GET", dlUrl, true);
  oReq.responseType = "blob";
  oReq.onerror = error => {
    //TODO display the error in global error handler
    console.log(error);
  };
  oReq.onload = oEvent => {
    const blob = oReq.response;
    if (blob) {
      const mimeType = oReq.getResponseHeader("content-type");
      const contentDisposition = oReq.getResponseHeader("Content-Disposition");
      const fileName = contentDisposition.substr(
        contentDisposition.lastIndexOf("=") + 1
      );
        //Here use writer from file entry to  save the temp file then use file opener
    } else {
        //TODO again display error in globlerrorhandler
        console.log("Error reading the file");
    }
  };
};

/** HOC to get the list viewer
 * @param {object} ListComp - a list component
 * @return {React.Component}
 */
export function getDoclinksViewer(ListComp) {
  /** Doclinks viewer */
  class DoclinksViewer extends React.Component {
    /** Constructor, bind the functions
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.currentRef = React.createRef();
      this.openDocument = this.openDocument.bind(this);
      this.state = { doclinksCont: null };
    }
    /** opens a document in browser or device */
    openDocument() {
      if (isCordovaApp && cordova.InAppBrowser) {
        cordova.InAppBrowser.open(
          maximoplus.net.getDownloadURL(
            this.state.doclinksCont,
            "doclinks",
            {}
          ),
          "_blank"
        );
        return;
      }
      window.open(
        maximoplus.net.getDownloadURL(this.state.doclinksCont, "doclinks", {}),
        "_blank"
      );
    }
    /** React lifecycle method to init the contaniers */
    componentDidMount() {
      if (this.state.doclinksCont) {
        return;
      }

      kont[this.props.container].then(mboCont => {
        this.setState({
          doclinksCont: new maximoplus.basecontrols.RelContainer(
            mboCont,
            "doclinks"
          )
        });
      });
    }
    /** React render method
     * @return {React.Element}
     */
    render() {
      if (!this.state.doclinksCont) return null;
      return (
        <ListComp
          norows="15"
          initdata={true}
          columns={[
            "document",
            "doctype",
            "description",
            "changeby",
            "changedate"
          ]}
          maxcontainer={this.state.doclinksCont}
          selectableF={this.openDocument}
        />
      );
    }
  }
  DoclinksViewer.propTypes = {
    container: PropTypes.string
  };
  return DoclinksViewer;
}

/** HOC to get the Picker
 * @param {object} Picker
 * @return {MPlusComponent}
 */
export function getAppDocTypesPicker(Picker) {
  // picker shouuld be the component, that has the state value. We will get the value by ref forwarding

  const AppDocPicker = getComponentAdapter(Picker);
  /** AppDocTypes picker */
  class MPAppDoctypes extends React.Component {
    /** Constructor, init the ref
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.currentRef = React.createRef();
      this.state = { appDocCont: null };
    }
    /** React render picker
     * @return {React.Element}
     */
    render() {
      if (!this.state.appDocCont) return null;
      return (
        <>
          <AppDocPicker
            maxcontainer={this.state.appDocCont}
            columns={["doctype"]}
            norows={100}
            ref={this.currentRef}
          />
        </>
      );
    }
    /** React lifecycle method, used to init the containers */
    componentDidMount() {
      if (this.state.appDocType) return;
      kont[this.props.container].then(mboCont => {
        const app = "=" + mboCont.getApp();
        const appDocCont = new maximoplus.basecontrols.MboContainer(
          "appdoctype"
        );
        appDocCont.setQbe("app", app);
        this.setState({ appDocCont: appDocCont });
      });
    }
    /** value getter*/
    get value() {
      return this.currentRef.current.state.value;
    }
  }
  MPAppDoctypes.propTypes = {
    container: PropTypes.string
  };
  return MPAppDoctypes;
}

/** HOC to retunr the List(Grid) component
 * @param {function} getListTemplate - function that retuns the JSX template of a list item
 * @param {function} drawFilterButton - function that draws a filter for list
 * @param {function} drawList - function that draws a List (top level)
 * @param {boolean} raw - if true, doesn't render the raws, implementing component does it. Some libraries require this
 * @return {MPlusComponent}
 */
export function getList(getListTemplate, drawFilterButton, drawList, raw) {
  // sometimes (like for ios template), the rows must not be rendered for the list, we just return the array of properties to be rendered in the parent list component

  /** List component*/
  class MPList extends MPlusComponent {
    /** Constructor, init the container from the core lib
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.fetchMore = this.fetchMore.bind(this);
      this.pageNext = this.pageNext.bind(this);
      this.pagePrev = this.pagePrev.bind(this);
      this.showFilter = this.showFilter.bind(this);
      if (this.props.dataSetCallback && !this.state) {
        this.props.dataSetCallback({
          fetchMore: this.fetchMore,
          oageNext: this.pageNext,
          pagePrev: this.pagePrev
        });
      }

      this.state = { dataSetInitialized: true };
    }
    /** init the component data*/
    initData() {
      this.mp.initData();
    }

    //    componentWillMount() {
    //      super.componentWillMount();

    //    }
    /** Initializes underlying core component
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }

      const mp = new maximoplus.re.Grid(
        mboCont,
        this.props.columns,
        this.props.norows
      );

      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
      if (this.props.showWaiting) {
        this.enableLocalWaitSpinner.bind(this)();
      }
      mp.renderDeferred();
      if (
        this.props.selectableF &&
        typeof this.props.selectableF == "function"
      ) {
        mp.setSelectableF(this.props.selectableF);
      }
      if (this.props.initdata) {
        mp.initData();
      }
    }
    /** When function is called, the wait will be displayed locally*/
    enableLocalWaitSpinner() {
      // useful for infinite scroll if we want to display the  spinner below the list. If not enabled, global wait will be used

      this.mp.prepareCall = _ => {
        if (!this.wrapper) return;
        this.wrapper.setState("waiting", true);
        this.wrapper.setState("startWait", Date.now());
      };
      this.mp.finishCall = _ => {
        if (this.wrapper) {
          this.wrapper.setState("waiting", false);
        }
      };
    }
    /**
     * Fetch more records into list, used mostly for infinite scroll
     * @param {number} numRows
     */
    fetchMore(numRows) {
      this.mp.fetchMore(numRows);
    }
    /** If paging is use instead of infinite scroll, go to next page */
    pageNext() {
      this.mp.pageNext();
    }
    /** If paging is use instead of infinite scroll, go to previous page */
    pagePrev() {
      this.mp.pagePrev();
    }

    /** React render
     * @return {React.Element}
     */
    render() {
      if (!this.Context) return <div />;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            if (!value) {
              return <div />;
            }
            const waiting = value.waiting;
            const paginator = value.paginator;
            const maxrows = value.maxrows;
            const _waiting =
              waiting && (!paginator || paginator.numrows != paginator.torow);
            let drs = [];

            if (maxrows) {
              const template = getListTemplate(this.props.listTemplate);
              if (template) {
                // raw means don't render the row, return just the props, and parent will take care of rendering with that props
                if (raw) {
                  drs = maxrows.map(o => {
                    const _o = template(o);
                    _o.key = o.data["_uniqueid"];
                    return _o;
                  });
                } else {
                  drs = maxrows.map(o => (
                    <template {...o} key={o.data["_uniqueid"]} />
                  ));
                }
              }
            }
            return drawList(drs, this.getFilterButton(), _waiting);
          }}
        </Consumer>
      );
    }
    /** Display the filter */
    showFilter() {
      const container = this.props.maxcontainer
        ? this.props.maxcontainer
        : kont[this.props.container];
      openDialog(this.context, {
        type: "filter",
        maxcontainer: container,
        filtername: this.props.filterTemplate
      });
    }
    /** Draws filter button
     * @return {React.Element}
     */
    getFilterButton() {
      if (this.props.filterTemplate) {
        return drawFilterButton(this.showFilter);
      }
      return <div />;
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  }
  MPList.propTypes = {
    container: PropTypes.string,
    listTemplate: PropTypes.string,
    filterTemplate: PropTypes.string
  };
  return MPList;
}

/** HOC to get the picker list
 * @param {function} drawPickerOption - draws individual option
 * @param {function} drawPicker - draws whole picker
 * @return {MPlusComponent}
 */
export function getPickerList(drawPickerOption, drawPicker) {
  /** Picker component */
  class MPPickerList extends MPlusComponent {
    /** Init underlying maximoplus grid
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      const mp = new maximoplus.re.Grid(
        mboCont,
        this.props.columns,
        this.props.norows
      );
      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
      mp.renderDeferred();
      if (
        this.props.selectableF &&
        typeof this.props.selectableF == "function"
      ) {
        mp.setSelectableF(this.props.selectableF);
      }

      mp.initData();
      this.props.maxpickerfield.addPickerList(mp);
    }
    /** React render method
     * @return {React.Element}
     */
    render() {
      if (!this.Context) return <div />;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            if (!value) return <div />;
            const maxrows = value.maxrows;
            let drs = [];
            if (maxrows) {
              drs = maxrows.map((object, i) => {
                const selected =
                  object.picked ||
                  (typeof object.picked === "undefined" && object.selected);
                const optionKey =
                  object.data[this.props.pickerkeycol.toUpperCase()];
                const optionVal =
                  object.data[this.props.pickercol.toUpperCase()];
                return drawPickerOption(
                  this.props.label,
                  selected,
                  optionKey,
                  optionVal,
                  this.props.changeListener
                );
              });
            }
            return drawPicker(this.props.label, this.props.changeListener, drs);
          }}
        </Consumer>
      );
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  }
  MPPickerList.propTypes = {
    label: PropTypes.string,
    changeListener: PropTypes.func,
    pickercol: PropTypes.string,
    pickerkeycol: PropTypes.string
  };
  return MPPickerList;
}

/** HOC to return the Section component
 * @param {object} WrappedTextField - text field
 * @param {object} WrappedPicker - picker comp
 * @param {boolean} drawFields - if true return the array, rendering in implemetation
 * @return {MPlusComponent}
 */
export function getSection(WrappedTextField, WrappedPicker, drawFields) {
  // like for the list, here we also support the "raw" rendering, i.e. this HOC returns the data, and parent does the actual rendering. We don't need the raw field for this, if wrappers are null, we just return the props. For picker list,we will have to send the array of values in one field (so we need to transfer the field row state to props)

  /** Section Component*/
  class MPSection extends MPlusComponent {
    /** Constructor, binds the change function
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.changeInternalFieldValue = this.changeInternalFieldValue.bind(this);
      this.state = { fieldValues: {} };
    }
    /**
     * Init uderlying core component
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      if (!mboCont || !this.props.columns || this.props.columns.length == 0)
        return;
      const mp = new maximoplus.re.Section(mboCont, this.props.columns);

      if (this.props.metadata) {
        mp.addColumnsMeta(this.props.metadata);
      }
      mp.renderDeferred();
      mp.initData();

      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;

      /*
If we call the maximo change handler for every field, Maximo may change the values, while the user is typing (it is trimming the spaces for example). We will keep the values internally in the state, and pass 2 functions to the field: 1) function that changes this state that is called from onChange field handler, and 2) Maximo change function that is called from onblur
*/
    }
    /** Value to be kept internally before sending to Maximo. React changes on every letter, maximo is designed to react on blur
     * @param {string} fieldKey
     * @param {string} value
     */
    changeInternalFieldValue(fieldKey, value) {
      const newFieldValues = Object.assign({}, this.state.fieldValues);
      newFieldValues[fieldKey] = value;
      this.setState({ fieldValues: newFieldValues });
    }
    /** React lifecycle, used to add the meta
     * @param {object} prevProps
     */
    componentDidUpdate(prevProps) {
      super.componentDidUpdate(prevProps);
      if (prevProps.metadata != this.props.metadata && this.mp) {
        this.mp.addColumnsMeta(this.props.metadata);
      }
    }
    /**
     *  render function
     * @return {React.ReactElement}
     */
    render() {
      if (!this.Context) return <div />;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            let flds = [];
            const raw = !WrappedTextField;
            if (value && value.maxfields) {
              flds = value.maxfields.map((f, i) => {
                const fKey = f.metadata.attributeName + i;
                if (f.metadata.picker && f.picker) {
                  const lst = f.picker.list;
                  if (lst) {
                    if (raw) {
                      return {
                        label: f.metadata.title,
                        maxcontainer: lst.listContainer,
                        selectableF: lst.selectableF,
                        pickercol: lst.pickerCol,
                        pickerkeycol: lst.pickerKeyCol,
                        columns: [lst.pickerKeyCol, lst.pickerCol],
                        changeListener: f.listeners["change"],
                        maxpickerfield: f.maximoField,
                        enabled: !f.readonly,
                        required: f.required,
                        norows: f.metadata.pickerrows,
                        type: f.metadata.maxType,
                        kind: "picker",
                        key: fKey
                      };
                    }
                    return (
                      <WrappedPicker
                        label={f.metadata.title}
                        maxcontainer={lst.listContainer}
                        selectableF={lst.selectableF}
                        pickercol={lst.pickerCol}
                        pickerkeycol={lst.pickerKeyCol}
                        columns={[lst.pickerKeyCol, lst.pickerCol]}
                        changeListener={f.listeners["change"]}
                        maxpickerfield={f.maximoField}
                        enabled={!f.readonly}
                        required={f.required}
                        norows={f.metadata.pickerrows}
                        type={f.metadata.maxType}
                        key={fKey}
                      />
                    );
                  } else {
                    return raw ? { key: fKey } : <div key={fKey} />;
                  }
                } else {
                  const _val = this.state.fieldValues[fKey]
                    ? this.state.fieldValues[fKey]
                    : f.data;
                  const attrs = {
                    label: f.metadata.title,
                    value: _val,
                    type: f.metadata.maxType,
                    listener: value =>
                      this.changeInternalFieldValue(fKey, value),
                    changeListener: () => {
                      const newFst = Object.assign({}, this.state.fieldValues);
                      const __vval = newFst[fKey];
                      if (__vval) {
                        // post the change only if there was change
                        delete newFst[fKey];
                        this.setState({ fieldValues: newFst });
                        f.listeners["change"](_val);
                      }
                    },
                    immediateChangeListener: f.listeners["change"],
                    enabled: !f.readonly,
                    required: f.required,
                    fieldKey: fKey
                  };
                  if (f.metadata.hasLookup) {
                    if (f.metadata.gl) {
                      attrs.showLookupF = () => f.maximoField.showGlLookup();
                    } else {
                      attrs.showLookupF = () => f.maximoField.showLookup();
                    }
                  }
                  if (raw) {
                    attrs.kind = "field";
                    return attrs;
                  }
                  return <WrappedTextField {...attrs} />;
                }
              });
            }
            return drawFields(flds);
          }}
        </Consumer>
      );
    }
    /** Internal*/
    static get contextType() {
      return getRootContext();
    }
  }
  MPSection.propTypes = {
    container: PropTypes.string,
    columns: PropTypes.array
  };
  return MPSection;
}

/** HOC to return the QbeSection component
 * @param {object} WrappedTextField - text field
 * @param {boolean} drawFields - if true return the array, rendering in implemetation
 *  @param {boolean} drawSearchButtons - if true return the array, rendering in implemetation
 * @return {MPlusComponent}
 */
export function getQbeSection(WrappedTextField, drawFields, drawSearchButtons) {
  /** Qbe section component */
  class MPQbeSection extends MPlusComponent {
    /** Constructor, binds the change function
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.getControlActions = this.getControlActions.bind(this);
      this.clear = this.clear.bind(this);
      this.search = this.search.bind(this);
      this.runControlAction = this.runControlAction.bind(this);
    }
    /**
     * Init uderlying core component
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      if (!mboCont || !this.props.columns || this.props.columns.length == 0)
        return;
      const mp = new maximoplus.re.QbeSection(mboCont, this.props.columns);

      /*
	 Important.
	 The QbeSection in MaximoPlus core library is the only component where column may be the string or the javascript object. The case for javascript object is when we want to search the range in QbeSection. For that we use the standard Maximo functionality - qbePrepend. The columns have to be registered when creating the QbeSection, and the qbePrepend data has to be sent with them, this is why we have that exception. For the case of the components registered with the markup (HTML or JSX, for the web components or React), we already have the metadata defined at the same time as the columns, so we can read this from the metadata itself, and send to the  MaximoPlus constructor.
	 */

      if (this.props.qbePrepends) {
        for (const qp of this.props.qbePrepends) {
          mp.addPrependColumns(
            qp.virtualName,
            qp.qbePrepend,
            qp.attributeName,
            qp.title,
            parseInt(qp.position)
          );
        }
      }

      if (this.props.metadata) {
        mp.addColumnsMeta(this.props.metadata);
      }

      mp.renderDeferred();
      mp.initData();

      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
    }
    /** Clears the qbe */
    clear() {
      this.mp.clearQbe();
    }
    /** Internal */
    componentWillUnmount() {
      //      if (this.mp) this.mp.clearQbe();
    }
    /** Perform the seaarch for the entered qbe */
    search() {
      this.mp.getContainer().reset();
      if (this.props.indialog) {
        // should not do this for the static qbe section
        this.mp.getParent().removeChild(this.mp); // MaximoPlus will try to send data on reset finish to this component
        closeDialog(this.context); // dialogs will be modal. If i can access the search, and there are dialogs, that means I clicked search from the dialog. If there are no dialogs, this command doesn't do anything
      }
    }
    /** Get the search buttons for the qbe control
     * @return {array}
     */
    getSearchButtons() {
      // this may not be necessary, it will render the search buttons for the dialog
      const buttons = [
        { label: "Search", action: this.search, key: "search" },
        { label: "Clear", action: this.clear, key: "clear" }
      ];
      if (this.filterDialog) {
        buttons.push({
          label: "Cancel",
          action: ev => this.filterDialog.closeDialog()
        });
      }
      return drawSearchButtons(buttons);
    }
    /** returns control actions
     * @return {array}
     */
    getControlActions() {
      // this is the "interface" method - we can use it for all the types of controls
      return this.getSearchButtons();
    }
    /** Runs the control aciton (clear or search)
     * @param {string} actionKey
     */
    runControlAction(actionKey) {
      // In React, if the actions are returned directly like in getSearchButtons, the binding loses the state
      // Instead this function called from the ref should work properly
      if (actionKey == "clear") {
        this.clear();
      }
      if (actionKey == "search") {
        this.search();
      }
    }
    /**
     *  render function
     * @return {React.ReactElement}
     */
    render() {
      if (!this.Context) return <div />;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            let flds = [];
            const buttons = this.getSearchButtons();
            if (value && value.maxfields) {
              flds = value.maxfields.map((f, counter) => {
                const attrs = {
                  label: f.metadata.title,
                  value: f.data,
                  type: f.metadata.maxType,
                  enabled: true,
                  listener: f.listeners["change"],
                  fieldKey: f.metadata.attributeName + counter
                };
                if (f.metadata.hasLookup) {
                  attrs.showLookupF = () => f.maximoField.showLookup();
                  attrs.qbe = true; // in qbe mode display only the text field, not the checkbox
                }
                if (!WrappedTextField) {
                  return attrs;
                }
                return <WrappedTextField key={attrs.fieldKey} {...attrs} />; // try to put this as a function, to be able to override. There is no indirection, or maybe HOC
              });
            }
            return drawFields(flds, buttons);
          }}
        </Consumer>
      );
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  }
  MPQbeSection.propypes = {
    container: PropTypes.string,
    columns: PropTypes.array
  };
  return MPQbeSection;
}

/** HOC to get the dialog
 * @param {object} DialogWrapper
 * @param {function} getDialogF
 * @param {function} defaultCloseDialogAction
 * @return {MPlusComponent}
 */
function getDialog(DialogWrapper, getDialogF, defaultCloseDialogAction) {
  /** Dialog Component */
  class Dialog extends React.Component {
    /** React lifecycle method
     * @param {object} props
     * @param {object} state
     * @return {boolean}
     */
    shouldComponentUpdate(props, state) {
      if (!props.dialogs || props.dialogs.length == this.props.dialogs.length)
        return false;
      return true;
    }
    /**
     *  render function
     * @return {React.ReactElement}
     */
    render() {
      if (!this.props.dialogs || this.props.dialogs.length == 0) {
        return <div />;
      }
      const currDialog = this.props.dialogs[this.props.dialogs.length - 1];
      if (!currDialog) {
        return <div />;
      } else {
        const CurrDialog = getDialogF(currDialog);
        if (CurrDialog) {
          return (
            <DialogWrapper
              defaultAction={currDialog.defaultAction}
              closeAction={
                currDialog.closeAction
                  ? currDialog.closeAction
                  : defaultCloseDialogAction
              }
            >
              <CurrDialog {...currDialog} />
            </DialogWrapper>
          );
        }
        return <div />;
      }
    }
  }
  Dialog.propTypes = {
    dialogs: PropTypes.array
  };
  return Dialog;
}

// Every MaximoPlus component will create the context. The dialog wrapper should remove the context once the dialog is closed.
// If the getDialogF returns directly the MaximoPlus components, it will have the oid property. DialogWrapper should remove thiat context
// If there is no oid, the dialog should have the cleanContext, that should clean context on each MaximoPlus component

/** HOC to get the dialog holder
 * @param {object} DialogWrapper
 * @param {function} getDialogF
 * @param {boolean} raw
 * @return {MPlusComponent}
 */
export function getDialogHolder(DialogWrapper, getDialogF, raw) {
  /** Dialog holder */
  class MPDialogHolder extends React.Component {
    /** Constructor, binds the open and close dialog functions
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.openDialog = this.openDialog.bind(this);
      this.closeDialog = this.closeDialog.bind(this);
    }
    /** internal */
    get Context() {
      return innerContexts["dialogs"];
    }
    /** Opens the dialog
     * @param {object} dialog
     */
    openDialog(dialog) {
      // can't access the openDialog and closeDialog functions directlry, becaise of the contexts
      // the dialogholder will have to be reffed from the main template, and there we can call this functions
      openDialog(this.context, dialog);
    }
    /** Closes the currently open dialog */
    closeDialog() {
      closeDialog(this.context);
    }
    /**
     * React render function
     * @return {React.ReactElement}
     */
    render() {
      /*
If both dialogwrapper and getdialogf is null, let the implementation manage the dialogs on itself
*/
      if (!this.Context) return <div />;
      const Consumer = this.Context.Consumer;
      let Dialog = null;
      if (!raw) {
        Dialog = getDialog(DialogWrapper, getDialogF, _ =>
          closeDialog(this.context)
        );
        return (
          <Consumer>
            {dialogs => {
              if (!dialogs) return <div />;
              return <Dialog dialogs={dialogs} />;
            }}
          </Consumer>
        );
      } else {
        const ff = _ => closeDialog(this.context);
        // in this case the implementation will take care of the dialog openings and closing
        return (
          <Consumer>
            {dialogs => {
              const dials = dialogs
                ? dialogs.map(d => {
                    d.closeTheDialog = ff;
                    return d;
                  })
                : null;
              return <DialogWrapper dialogs={dials} />;
            }}
          </Consumer>
        );
      }
    }
    /** React lifecycle component, attach the dialog context */
    componentDidMount() {
      if (!innerContexts["dialogs"]) {
        innerContexts["dialogs"] = this.context.addInnerContext("dialogs");
      }
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  }
  MPDialogHolder.propTypes = {};
  return MPDialogHolder;
}

/** HOC to return the List Dialog
 * @param {object} WrappedList
 * @param {function} drawList
 * @return {MPlusComponent}
 */
export function getListDialog(WrappedList, drawList) {
  /** List Dialog components */
  class MPListDialog extends React.Component {
    /**
     * React render function
     * @return {React.ReactElement}
     */
    render() {
      const LstD = drawList();

      return (
        <LstD {...this.props}>
          <WrappedList
            norows="10"
            listTemplate={this.props.dialog.field.getMetadata().listTemplate}
            filterTemplate={
              this.props.dialog.field.getMetadata().filterTemplate
            }
            maxcontainer={this.props.dialog.listContainer}
            initdata="true"
            columns={this.props.dialog.dialogCols}
            selectableF={this.props.dialog.defaultAction}
          />
        </LstD>
      );
    }
    /** React lifecycle component */
    componentWillUnmount() {
      if (this.props.dialog.listContainer) {
        //  this.props.dialog.listContainer.reset();
        // clear the filter (check unmount from qbesection
      }
    }
  }
  MPListDialog.propTypes = {
    dialog: PropTypes.object
  };
  return MPListDialog;
}

/** Function to return the filter dialog
 * @param {function} getFilter - function to get the filter
 * @param {function} drawFilter - draw the filter
 * @return {MPlusComponent}
 */
export function getFilterDialog(getFilter, drawFilter) {
  return props => drawFilter(getFilter(props.dialog));
}

/** HOC to return the gl dialog
 * @param {function} drawDialog - function to draw the gl dialog
 * @param {MPlusComponent} WrappedList - List component
 * @return {MPlusComponent}
 */
export function getGLDialog(drawDialog, WrappedList) {
  // glindividualsegment is a function of object with the following keys:
  // - listener
  // - segmentName
  // - segmentValue
  // - segmentDelimiter
  // drawSegments is  a function that draws all the segments into one gl (arg - array of above objects)
  // drawDialog draws the final dialog from all these
  // WrappedList - concreate List implementation
  /** GL Dialog component */
  class MPGLDialog extends MPlusComponent {
    /** React lifecycle component */
    componentDidMount() {
      super.componentDidMount();
      if (this.mp) {
        return;
      }

      const mp = new maximoplus.re.GLDialog(this.props.field, this.props.orgid);
      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
      mp.renderDeferred();
    }
    /** React render lifecycle method
     * @return {React.Element}
     */
    render() {
      if (!this.Context) return <div />;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            if (!value || !value.segments || !value.pickerlist) return <div />;
            const segments = value.segments;
            const pickerList = value.pickerlist;
            const chooseF = value.chooseF;
            const gllist = (
              <WrappedList
                maxcontainer={pickerList.glcontainer}
                columns={pickerList.pickercols}
                norows="20"
                initdata="true"
                listTemplate="gllist"
                selectableF={pickerList.pickerf}
              />
            );
            return drawDialog(segments, gllist, chooseF);
          }}
        </Consumer>
      );
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  }
  MPGLDialog.propTypes = { field: PropTypes.object, orgid: PropTypes.string };
  return MPGLDialog;
}

/** HOC to return the workflow dialog
 * @param {MPlusComponent} WrappedSection
 * @param {function} drawDialog
 * @return {MPlusComponent}
 */
export function getWorkflowDialog(WrappedSection, drawDialog) {
  /** Workflow dialog component */
  return class MPWorkflowDialog extends MPlusComponent {
    /** Constructor, inits the state
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.state = { finished: false };
    }
    /**
     * Init uderlying core component
     * @param {object} mboCont
     */
    putContainer(mboCont) {
      if (this.mp) {
        return;
      }
      const mp = new maximoplus.re.WorkflowControl(
        mboCont,
        this.props.processname
      );

      mp.routeWf();
      const wrapper = new MaximoPlusWrapper(this.context, this.oid, mp);
      innerContexts[this.oid].mp = mp;
      innerContexts[this.oid].wrapper = wrapper;
    }
    /**
     * React render function
     * @return {React.ReactElement}
     */
    render() {
      if (!this.Context) return <div />;
      const Consumer = this.Context.Consumer;
      return (
        <Consumer>
          {value => {
            const section = value && value.section;
            const actions = value && value.actions;
            if (!section || !section.fields || !actions) {
              return <div />;
            }
            let metadata = {
              ACTIONID: {
                picker: "true",
                pickerkeycol: "actionid",
                pickercol: "instruction",
                pickerrows: "10"
              }
            };

            if (section.objectName == "REASSIGNWF") {
              metadata = {
                ASSIGNEE: { hasLookup: "true", listTemplate: "personlist" }
              };
            }
            return drawDialog(
              value.title,
              <WrappedSection
                maxcontainer={section.container}
                columns={section.fields}
                metadata={metadata}
              />,
              actions,
              value.warnings
            );
          }}
        </Consumer>
      );
      //
    }
    /** Internal */
    static get contextType() {
      return getRootContext();
    }
  };
}

export const reload = contid => {
  kont[contid].then(mp => {
    mp.reset();
    mp.moveTo(0);
  });
};

export const save = contid => {
  kont[contid].then(mp => mp.save());
};

const _uploadFile = (container, uploadMethod, file, doctype) => {
  const fd = new FormData();
  fd.append("docname", file.name);
  fd.append("doctype", doctype);
  //  fd.append("file", file);
  const prom = kont[container].then(mbocont => {
    return new Promise((resolve, reject) => {
      if (!isCordovaApp) {
        maximoplus.net.upload(
          mbocont,
          uploadMethod,
          null,
          fd,
          function(ok) {
            resolve(ok);
          },
          function(err) {
            reject(err);
          },
          function(loaded, total) {
            file.percloaded = Math.round(loaded / total);
          }
        );
      } else {
        const reader = new FileReader();
        reader.onloadend = evt => {
          const blob = new Blob([evt.target.result], { type: "image/jpeg" });
          fd.append("file", blob, file.name);
          maximoplus.net.upload(
            mbocont,
            uploadMethod,
            null,
            fd,
            function(ok) {
              resolve(ok);
            },
            function(err) {
              reject(err);
            },
            function(loaded, total) {
              file.percloaded = Math.round(loaded / total);
            }
          );
        };
        reader.readAsArrayBuffer(file);
      }
    });
  });
  return prom;
};

/** the functions for attaching, etc. should be accessed from ref. Wrapper will be there just to display the currently attached files and errors 
@param{object} Wrapper
@return {MPlusComponent}
*/
export function getDoclinksUpload(Wrapper) {
  /** Doclinks Upload Component */
  class DoclinksUpload extends React.Component {
    /** Constructor, binds the change function
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.inputRef = React.createRef();
      this.state = { files: [], uploading: false };
      this.addFiles = this.addFiles.bind(this);
      this.attachFiles = this.attachFiles.bind(this);
      this.removeFile = this.removeFile.bind(this);
      this.uploadFies = this.uploadFiles.bind(this);
    }
    /** Internal methid to attach the files */
    attachFiles() {
      this.inputRef.current.click();
    }
    /** Add the files before the upload
     * @param {array} files
     */
    addFiles(files) {
      this.setState((state, props) => {
        return { files: [...state.files, ...files] };
      });
    }
    /** Remove the file from the list of uploaded
     * @param {number} index
     */
    removeFile(index) {
      this.setState((state, props) => {
        const fls = state.files;
        return {
          files: fls.slice(0, index - 1).concat(fls.slice(index, fls.length))
        };
      });
    }
    /** Upload one file
     * @param{File} file
     * @param{string} doctype
     * @return {Promise}
     */
    uploadFile(file, doctype) {
      const uploadMethod = this.props.uploadMethod
        ? this.props.uploadMethod
        : "doclinks";
      return _uploadFile(this.props.container, uploadMethod, file, doctype);
    }
    /** Upload attached files
     * @param {string} doctype
     */
    async uploadFiles(doctype) {
      this.setState({ uploading: true });
      const errors = {};
      for (let j = 0; j < this.state.files.length; j++) {
        try {
          await this.uploadFile(this.state.files[j], doctype);
          this.setState(state => {
            const finished = state.finished;
            if (!finished) {
              return { finished: [j] };
            }
            const _finished = [...finished, j];
            return { finished: _finished };
          });
        } catch (err) {
          errors[j] = err;
        }
      }
      this.setState({ errors: errors, uploading: false, files: [] });
    }
    /**
     * React  render function
     * @return {React.ReactElement}
     */
    render() {
      return (
        <div>
          <Wrapper {...this.state} />
          <input
            ref={this.inputRef}
            type="file"
            style={{ display: "none" }}
            multiple
            onChange={ev => this.addFiles(ev.target.files)}
            id="filehidden"
          />
        </div>
      );
    }
  }
  DoclinksUpload.propTypes = {
    container: PropTypes.string,
    uploadMethod: PropTypes.string
  };
  return DoclinksUpload;
}

/** HOC to get photo upload component
 * @param {object} Wrapper
 * @return {MPlusComponent}
 */
export function getPhotoUpload(Wrapper) {
  /** PhotoUpload component
   * For Cordova you need to install camera and file plugins
   */
  class PhotoUpload extends React.Component {
    /** Constructor, binds the functions
     * @param {object} props
     */
    constructor(props) {
      super(props);
      this.webcamRef = React.createRef();
      this.uploadPhoto = this.uploadPhoto.bind(this);
      this.shoot = this.shoot.bind(this);
      this.removePhoto = this.removePhoto.bind(this);
      this.state = { imgData: null, file: null, error: null, uploading: false };
      // two separate functions, so the user can preview. You can combine them into one if you need
    }
    /** Get the picture form the webca or cameram */
    shoot() {
      if (!isCordovaApp) {
        const img64 = this.webcamRef.current.getScreenshot();
        const rawImageData = img64.replace(/^data:image\/\w+;base64,/, "");
        const arrayBuf = decode(rawImageData);
        const fileName = "IMG-" + new Date().valueOf() + ".jpg";
        const f = new File([arrayBuf], fileName, { type: "image/jpeg" });
        this.setState({ imgData: img64, file: f, error: null });
      } else {
        const options = {
          quality: 50,
          destinationType: Camera.DestinationType.FILE_URI,
          sourceType: Camera.PictureSourceType.CAMERA,
          encodingType: Camera.EncodingType.JPEG,
          mediaType: Camera.MediaType.PICTURE,
          allowEdit: true,
          correctOrientation: true // Corrects Android orientation quirks
        };
        navigator.camera.getPicture(
          pictureUri => {
            window.resolveLocalFileSystemURL(
              pictureUri,
              fileEntry => {
                fileEntry.file(f => {
                  this.setState({ imgData: pictureUri, file: f, error: null });
                });
              },
              console.log
            );
          },
          console.log,
          options
        );
      }
    }
    /** Removes the previous picture */
    removePhoto() {
      this.setState({
        imgData: null,
        file: null,
        eror: null,
        uploading: false
      });
    }
    /** Uploads the picture
     * @param {string} doctype
     */
    uploadPhoto(doctype) {
      if (!this.state.file) {
        this.setState({ error: "No image ready for upload" });
        return;
      }
      const uploadMethod = this.props.uploadMethod
        ? this.props.uploadMethod
        : "doclinks";
      _uploadFile(
        this.props.container,
        uploadMethod,
        this.state.file,
        doctype || this.props.doctype
      )
        .then(_ => this.removePhoto())
        .catch(err => this.setState({ uploading: false, error: err }));
    }
    /** React render method
	@return {React.Element}
    */
    render() {
      const webcamW = isCordovaApp
        ? window.innerWidth
        : this.props.width
          ? this.props.width
          : 400;
      const webcamH = this.props.height ? this.props.height : 400;
      const displayEl = this.state.imgData ? (
        <img src={this.state.imgData} style={{ width: webcamW }} />
      ) : isCordovaApp ? null : (
        <WebCam
          ref={this.webcamRef}
          screenshotFormat="image/jpeg"
          audio={false}
          width={webcamW}
          height={webcamH}
        />
      );
      // these two properties sent to wrapper will be used to codnitionally display buttons
      return (
        <Wrapper
          readyForUpload={!this.state.uploading && this.state.file}
          canTakePhoto={!this.state.file}
        >
          {displayEl}
        </Wrapper>
      );
    }
  }
  PhotoUpload.propTypes = {
    container: PropTypes.string,
    uploadMethod: PropTypes.string,
    doctype: PropTypes.string,
    width: PropTypes.number,
    height: PropTypes.number
  };
  return PhotoUpload;
}
