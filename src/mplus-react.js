import React from "react";

let kont = {};

const resolveContainer = (contid, container) => {
  if (kont[contid]) {
    kont[contid].resolve(container);
  } else {
    kont[contid] = Promise.resolve(container);
  }
};

const getDeferredContainer = contId => {
  if (kont[contId]) {
    return kont[contId];
  }
  let _resolve, _reject;
  let prom = new Promise(function(resolve, reject) {
    _resolve = resolve;
    _reject = reject;
  });
  prom.resolve = _resolve;
  prom.reject = _reject;
  kont[contId] = prom;
  return prom;
};

class AppContainer extends React.Component {
  constructor(props) {
    super(props);
    let mp = new maximoplus.basecontrols.AppContainer(
      this.props.mboname,
      this.props.appname
    );
    if (this.props.offlineenabled) {
      mp.setOfflineEnabled(true);
    }
    resolveContainer(this.props.id, mp);
    this.state = { mp: mp };
  }

  render() {
    return <div mboname={this.props.mboname} appname={this.props.appname} />;
  }

  componentWillUnmount() {
    this.state.mp.dispose();
    delete kont[this.props.id];
  }
}

class RelContainer extends React.Component {
  construnctor(props) {
    getDeferredContainer(this.props.container).then(mboCont => {
      let mp = new maximoplus.basecontrols.RelContainer(
        mboCont,
        this.props.relationship
      );
      this.state = { mp: mp };
      resolveContainer(this.props.id, mp);
    });
  }

  render() {
    return (
      <div
        container={this.props.container}
        relationship={this.props.relationship}
      />
    );
  }

  compnentWillUnmount() {
    this.state.mp.dispose();
    delete kont[this.props.id];
  }
}
